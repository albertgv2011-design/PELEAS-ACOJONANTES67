const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..', 'public');
const rooms = new Map();
const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    res.writeHead(200, {'Content-Type': ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'}[ext] || 'application/octet-stream'), 'Access-Control-Allow-Origin':'*'});
    res.end(data);
  });
});
const wss = new WebSocketServer({ server });
function send(ws, data) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(data)); }
function broadcast(room, data) { for (const p of room.players) send(p.ws, data); }
function leave(ws) {
  const code = ws.roomCode; if (!code) return;
  const room = rooms.get(code); if (!room) return;
  room.players = room.players.filter(p => p.ws !== ws);
  broadcast(room, {type:'peer-left', players:room.players.length});
  if (!room.players.length) rooms.delete(code);
  ws.roomCode = null;
}
wss.on('connection', ws => {
  ws.id = crypto.randomUUID(); ws.lastPing = Date.now();
  send(ws, {type:'connected', id:ws.id, serverTime:Date.now()});
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.type === 'create-room') {
      leave(ws);
      let code = (m.code || crypto.randomBytes(3).toString('hex')).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
      if (!code) code = crypto.randomBytes(3).toString('hex').toUpperCase();
      if (rooms.has(code)) return send(ws,{type:'error',message:'Aquest codi ja existeix. Prova’n un altre.'});
      const room = {code, players:[{ws,id:ws.id,character:m.character || 'puigdemont'}], state:'waiting', created:Date.now()};
      rooms.set(code,room); ws.roomCode=code; ws.playerIndex=0;
      return send(ws,{type:'room-created',code,playerIndex:0,players:1});
    }
    if (m.type === 'join-room') {
      leave(ws); const code=String(m.code||'').toUpperCase(); const room=rooms.get(code);
      if (!room) return send(ws,{type:'error',message:'No s’ha trobat la sala.'});
      if (room.players.length >= 2) return send(ws,{type:'error',message:'La sala és plena.'});
      room.players.push({ws,id:ws.id,character:m.character || 'rex'}); ws.roomCode=code; ws.playerIndex=1;
      broadcast(room,{type:'room-ready',code,players:2,characters:room.players.map(p=>p.character)});
      room.players.forEach((p,i)=>{p.ws.playerIndex=i; send(p.ws,{type:'joined-room',code,playerIndex:i,players:2,characters:room.players.map(x=>x.character)});});
      return;
    }
    const room=rooms.get(ws.roomCode); if (!room) return;
    if (m.type === 'select-character') {
      const p=room.players.find(p=>p.ws===ws); if(p) p.character=String(m.character||'rex').slice(0,40);
      broadcast(room,{type:'characters',characters:room.players.map(p=>p.character||'rex')});
    } else if (m.type === 'start') {
      if(room.players.length!==2) return send(ws,{type:'error',message:'Calen dos jugadors reals.'});
      room.state='fighting'; room.fight={hp:[100,100],charge:[0,0],hits:[0,0],blocking:[false,false],blockStarted:[0,0],blockCooldownUntil:[0,0],blockTimers:[null,null],positions:[20,80],started:Date.now()};
      broadcast(room,{type:'fight-start',hp:[100,100],charge:[0,0],characters:room.players.map(p=>p.character||'puigdemont'),started:room.fight.started});
    } else if (m.type === 'action' && room.state==='fighting') {
      const i=ws.playerIndex===1?1:0; const opponent=1-i;
      if (!['move-left','move-right','jump','crouch','attack','rare','block'].includes(m.action)) return;
      if (m.action==='block') {
        const now=Date.now();
        if (m.active===false) {
          if (room.fight.blockTimers[i]) clearTimeout(room.fight.blockTimers[i]);
          room.fight.blockTimers[i]=null;
          if (room.fight.blocking[i]) room.fight.blockCooldownUntil[i]=now+5000;
          room.fight.blocking[i]=false;
        } else if (!room.fight.blocking[i] && now>=room.fight.blockCooldownUntil[i]) {
          room.fight.blocking[i]=true;room.fight.blockStarted[i]=now;
          if (room.fight.blockTimers[i]) clearTimeout(room.fight.blockTimers[i]);
          room.fight.blockTimers[i]=setTimeout(()=>{
            if(!rooms.has(room.code)||room.state!=='fighting')return;
            room.fight.blocking[i]=false;room.fight.blockCooldownUntil[i]=Date.now()+5000;room.fight.blockTimers[i]=null;
            broadcast(room,{type:'combat-event',player:i,action:'block-expired',hp:room.fight.hp.slice(),charge:room.fight.charge.slice(),blocking:room.fight.blocking.slice(),positions:room.fight.positions.slice(),blockCooldownUntil:room.fight.blockCooldownUntil[i]});
          },3000);
        } else if (!room.fight.blocking[i] && now<room.fight.blockCooldownUntil[i]) {
          return send(ws,{type:'error',message:'Bloqueig en cooldown. Espera 5 segons.'});
        }
        return broadcast(room,{type:'combat-event',player:i,action:'block',hp:room.fight.hp.slice(),charge:room.fight.charge.slice(),blocking:room.fight.blocking.slice(),positions:room.fight.positions.slice(),blockCooldownUntil:room.fight.blockCooldownUntil[i]});
      }
      if (m.action==='attack'||m.action==='rare') {
        if (m.action==='rare' && room.fight.charge[i] < 100) return send(ws,{type:'error',message:'L’habilitat rara encara no està carregada: encerta 8 cops bàsics.'});
        const distance=Math.abs(room.fight.positions[i]-room.fight.positions[opponent]);
        const range=m.action==='attack'?15:24;
        if(distance>range){
          return broadcast(room,{type:'combat-event',player:i,action:'miss',hp:room.fight.hp.slice(),charge:room.fight.charge.slice(),blocking:room.fight.blocking.slice(),positions:room.fight.positions.slice(),damage:0,distance,range});
        }
        let dmg=m.action==='attack'?8:32;
        if (m.action==='rare') room.fight.charge[i]=0;
        if (m.action==='attack') room.fight.charge[i]=Math.min(100,room.fight.charge[i]+12.5);
        const blocked=room.fight.blocking[opponent];
        if (blocked) dmg=Math.ceil(dmg*0.2);
        room.fight.hp[opponent]=Math.max(0,room.fight.hp[opponent]-dmg);
        if (m.action==='attack') room.fight.hits[i]++;
        broadcast(room,{type:'combat-event',player:i,action:m.action,hp:room.fight.hp.slice(),charge:room.fight.charge.slice(),blocking:room.fight.blocking.slice(),positions:room.fight.positions.slice(),damage:dmg,distance,range});
        if(room.fight.hp[opponent]===0){room.state='finished'; broadcast(room,{type:'fight-over',winner:i,hp:room.fight.hp.slice(),charge:room.fight.charge.slice()});}
      } else {
        // Small frequent authoritative steps keep both clients in sync; the edges are the map limits.
        room.fight.positions[i]=Math.max(0,Math.min(100,room.fight.positions[i]+(m.action==='move-left'?-2:m.action==='move-right'?2:0)));
        broadcast(room,{type:'combat-event',player:i,action:m.action,hp:room.fight.hp.slice(),charge:room.fight.charge.slice(),blocking:room.fight.blocking.slice(),positions:room.fight.positions.slice()});
      }
    } else if(m.type==='rematch') { if(room.players.length===2){room.state='fighting';room.fight={hp:[100,100],charge:[0,0],hits:[0,0],blocking:[false,false],blockStarted:[0,0],blockCooldownUntil:[0,0],blockTimers:[null,null],started:Date.now(),positions:[20,80]};broadcast(room,{type:'fight-start',hp:[100,100],charge:[0,0],started:room.fight.started,positions:[20,80]});} }
    else if(m.type==='ping') send(ws,{type:'pong',sent:m.sent,serverTime:Date.now()});
  });
  ws.on('close',()=>leave(ws)); ws.on('error',()=>leave(ws));
});
server.listen(PORT,'0.0.0.0',()=>console.log(`PELEAS ACOJONANTES server listening on ${PORT}`));
