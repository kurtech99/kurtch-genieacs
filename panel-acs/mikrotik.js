const net = require('net');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading config.json:', e);
  }
  return {
    mikrotik: {
      host: '192.168.88.1',
      port: 8728,
      user: 'admin',
      password: '',
      timeout: 4000
    }
  };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving config.json:', e);
    return false;
  }
}

class RouterOSClient {
  constructor(host, port, user, password, timeout = 4000) {
    this.host = host;
    this.port = port;
    this.user = user;
    this.password = password;
    this.timeout = timeout;
  }

  encodeLen(len) {
    if (len < 0x80) return Buffer.from([len]);
    if (len < 0x4000) {
      len |= 0x8000;
      return Buffer.from([len >> 8, len & 0xFF]);
    }
    if (len < 0x200000) {
      len |= 0xC00000;
      return Buffer.from([len >> 16, (len >> 8) & 0xFF, len & 0xFF]);
    }
    if (len < 0x10000000) {
      len |= 0xE0000000;
      return Buffer.from([len >> 24, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
    }
    return Buffer.from([0]);
  }

  encodeSentence(words) {
    const bufs = [];
    for (const w of words) {
      const b = Buffer.from(w, 'utf8');
      bufs.push(this.encodeLen(b.length));
      bufs.push(b);
    }
    bufs.push(Buffer.from([0]));
    return Buffer.concat(bufs);
  }

  decodeSentences(buf) {
    const sentences = [];
    let currentWords = [];
    let offset = 0;

    while (offset < buf.length) {
      let b = buf[offset];
      let len = 0;
      let lenBytes = 0;

      if ((b & 0x80) === 0x00) {
        len = b;
        lenBytes = 1;
      } else if ((b & 0xC0) === 0x80) {
        if (offset + 1 >= buf.length) break;
        len = ((b & ~0x80) << 8) | buf[offset + 1];
        lenBytes = 2;
      } else if ((b & 0xE0) === 0xC0) {
        if (offset + 2 >= buf.length) break;
        len = ((b & ~0xC0) << 16) | (buf[offset + 1] << 8) | buf[offset + 2];
        lenBytes = 3;
      } else if ((b & 0xF0) === 0xE0) {
        if (offset + 3 >= buf.length) break;
        len = ((b & ~0xE0) << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
        lenBytes = 4;
      } else {
        offset++;
        continue;
      }

      offset += lenBytes;
      if (len === 0) {
        sentences.push(currentWords);
        currentWords = [];
      } else {
        if (offset + len > buf.length) {
          offset -= lenBytes;
          break;
        }
        const word = buf.slice(offset, offset + len).toString('utf8');
        currentWords.push(word);
        offset += len;
      }
    }

    return { sentences, remaining: buf.slice(offset) };
  }

  execute(commandWords) {
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const done = (err, result) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        try { socket.destroy(); } catch (e) {}
        if (err) reject(err);
        else resolve(result);
      };

      const socket = net.createConnection(this.port, this.host);
      let buffer = Buffer.alloc(0);
      let state = 'login'; // login -> command -> done
      let results = [];
      let trapMessage = null;

      const timer = setTimeout(() => {
        done(new Error('Connection timeout to MikroTik (' + this.host + ':' + this.port + ')'));
      }, this.timeout);

      socket.on('connect', () => {
        socket.write(this.encodeSentence(['/login', '=name=' + this.user, '=password=' + this.password]));
      });

      socket.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        const { sentences, remaining } = this.decodeSentences(buffer);
        buffer = remaining;

        for (const sentence of sentences) {
          if (sentence.length === 0) continue;
          const replyType = sentence[0];

          if (state === 'login') {
            if (replyType === '!trap') {
              for (const w of sentence) {
                if (w.startsWith('=message=')) trapMessage = w.substring(9);
              }
            } else if (replyType === '!done') {
              if (trapMessage) {
                return done(new Error(trapMessage));
              }
              state = 'command';
              socket.write(this.encodeSentence(commandWords));
            } else if (replyType === '!fatal') {
              return done(new Error('Login fatal error: ' + (trapMessage || sentence.join(' '))));
            }
          } else if (state === 'command') {
            if (replyType === '!re') {
              const item = {};
              for (let i = 1; i < sentence.length; i++) {
                const w = sentence[i];
                if (w.startsWith('=')) {
                  const eqIdx = w.indexOf('=', 1);
                  if (eqIdx !== -1) {
                    const k = w.substring(1, eqIdx);
                    const v = w.substring(eqIdx + 1);
                    item[k] = v;
                  }
                }
              }
              results.push(item);
            } else if (replyType === '!done') {
              return done(null, results);
            } else if (replyType === '!trap') {
              for (const w of sentence) {
                if (w.startsWith('=message=')) trapMessage = w.substring(9);
              }
              return done(new Error(trapMessage || 'Command failed'));
            }
          }
        }
      });

      socket.on('error', err => {
        done(err);
      });

      socket.on('close', () => {
        done(new Error(trapMessage || 'Connection closed by MikroTik'));
      });
    });
  }
}

function getClient() {
  const cfg = loadConfig();
  const mt = cfg.mikrotik || {};
  return new RouterOSClient(
    mt.host || '192.168.88.1',
    mt.port || 8728,
    mt.user || 'admin',
    mt.password || '',
    mt.timeout || 4000
  );
}

// In-memory cache for Hotspot Active
let cacheHotspot = {
  timestamp: 0,
  data: { success: false, count: 0, connected: false, error: 'Belum dimuat', users: [] }
};

async function getHotspotActive(forceFresh = false) {
  const now = Date.now();
  // Return cached result if within 5 seconds
  if (!forceFresh && (now - cacheHotspot.timestamp < 5000)) {
    return cacheHotspot.data;
  }

  const client = getClient();

  try {
    const list = await client.execute([
      '/ip/hotspot/active/print',
      '=.proplist=.id,user,address,uptime,mac-address,bytes-in,bytes-out'
    ]);

    const result = {
      success: true,
      connected: true,
      count: list.length,
      users: list.map(u => ({
        id: u['.id'],
        user: u['user'] || '-',
        ip: u['address'] || '-',
        mac: u['mac-address'] || '-',
        uptime: u['uptime'] || '-',
        bytesIn: parseInt(u['bytes-in']) || 0,
        bytesOut: parseInt(u['bytes-out']) || 0
      }))
    };

    cacheHotspot = { timestamp: now, data: result };
    return result;
  } catch (err) {
    const errResult = {
      success: false,
      connected: false,
      count: 0,
      error: err.message,
      users: []
    };
    cacheHotspot = { timestamp: now, data: errResult };
    return errResult;
  }
}

// Cache for Hotspot User Profiles
let cacheProfiles = {
  timestamp: 0,
  data: []
};

async function getHotspotProfiles(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && (now - cacheProfiles.timestamp < 30000) && cacheProfiles.data.length > 0) {
    return cacheProfiles.data;
  }

  const client = getClient();
  try {
    const list = await client.execute([
      '/ip/hotspot/user/profile/print',
      '=.proplist=.id,name,shared-users,rate-limit'
    ]);

    const profiles = list.map(p => ({
      id: p['.id'],
      name: p['name'] || '',
      sharedUsers: p['shared-users'] || '1',
      rateLimit: p['rate-limit'] || '-'
    }));

    cacheProfiles = { timestamp: now, data: profiles };
    return profiles;
  } catch (err) {
    console.error('Error fetching hotspot profiles from MikroTik:', err.message);
    if (cacheProfiles.data.length > 0) return cacheProfiles.data;
    return [
      { name: 'FREE Member', sharedUsers: '1', rateLimit: '1024k/1024k' },
      { name: 'FREE 2 HP', sharedUsers: '2', rateLimit: '5120k/5120k' },
      { name: 'FREE 4 HP', sharedUsers: '4', rateLimit: '5120k/5120k' },
      { name: 'default', sharedUsers: '1', rateLimit: '-' }
    ];
  }
}

async function createOrUpdateHotspotUser(username, password, profile = 'FREE Member', comment = 'by genieacs', server = 'all') {
  if (!username) {
    throw new Error('Username hotspot tidak boleh kosong');
  }

  const client = getClient();
  const safeUser = String(username).trim();
  const safePass = String(password || '').trim();
  const safeProfile = String(profile || 'FREE Member').trim();
  const safeComment = String(comment || 'by genieacs').trim();

  // 1. Cek apakah user sudah terdaftar di MikroTik
  const existing = await client.execute([
    '/ip/hotspot/user/print',
    '?name=' + safeUser,
    '=.proplist=.id,name,profile,comment'
  ]);

  if (existing && existing.length > 0) {
    const userId = existing[0]['.id'];
    const setCmd = [
      '/ip/hotspot/user/set',
      '=.id=' + userId,
      '=password=' + safePass,
      '=profile=' + safeProfile
    ];
    if (safeComment) {
      setCmd.push('=comment=' + safeComment);
    }
    await client.execute(setCmd);
    return {
      success: true,
      action: 'updated',
      id: userId,
      username: safeUser,
      profile: safeProfile,
      comment: safeComment
    };
  } else {
    const addCmd = [
      '/ip/hotspot/user/add',
      '=name=' + safeUser,
      '=password=' + safePass,
      '=profile=' + safeProfile,
      '=server=' + (server || 'all')
    ];
    if (safeComment) {
      addCmd.push('=comment=' + safeComment);
    }
    await client.execute(addCmd);
    return {
      success: true,
      action: 'created',
      username: safeUser,
      profile: safeProfile,
      comment: safeComment
    };
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  getHotspotActive,
  getHotspotProfiles,
  createOrUpdateHotspotUser,
  RouterOSClient
};

