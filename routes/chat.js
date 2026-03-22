const express = require('express');
const router = express.Router();
const ChatMessage = require('../models/chatMessageSchema');
const User = require('../models/userSchema');
const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const cacheClient = createClient({ url: redisUrl });
let redisReady = false;

cacheClient.connect()
  .then(() => {
    redisReady = true;
    console.log('[chat-route] Redis cache connected');
  })
  .catch((error) => {
    console.error('[chat-route] Redis cache connection failed:', error);
  });

const roomMessagesKey = (room) => `room:${room}:messages`;

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

router.get('/', isAuthenticated, (req, res) => {
  res.render('chat', { user: req.user });
});

router.get('/api/messages/:room?', isAuthenticated, async (req, res) => {
  try {
    const room = req.params.room || 'general';
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before ? new Date(req.query.before) : null;

    if (redisReady) {
      const cachedRaw = await cacheClient.lRange(roomMessagesKey(room), 0, 49);

      if (cachedRaw.length > 0) {
        const cachedMessages = cachedRaw
          .map((msg) => {
            try {
              return JSON.parse(msg);
            } catch (error) {
              return null;
            }
          })
          .filter(Boolean);

        if (cachedMessages.length > 0) {
          const oldestCached = cachedMessages[cachedMessages.length - 1];
          const oldestCachedTimestamp = new Date(oldestCached.timestamp);
          const isOlderPaginationRequest = before && before <= oldestCachedTimestamp;

          if (!isOlderPaginationRequest) {
            const filteredMessages = before
              ? cachedMessages.filter((msg) => new Date(msg.timestamp) < before)
              : cachedMessages;

            const limited = filteredMessages.slice(0, limit);
            return res.json(limited.reverse());
          }
        }
      }
    }

    const messages = await ChatMessage.find({
      room: room,
      timestamp: { $lt: before || new Date() }
    })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('user', 'username')
    .lean();
    
    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.get('/api/rooms', isAuthenticated, async (req, res) => {
  try {
    const rooms = await ChatMessage.distinct('room');
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

router.get('/api/users/:userId/public-key', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('_id username publicKey').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId: user._id,
      username: user.username,
      publicKey: user.publicKey || null,
    });
  } catch (error) {
    console.error('Error fetching user public key:', error);
    res.status(500).json({ error: 'Failed to fetch public key' });
  }
});

router.post('/api/users/me/public-key', isAuthenticated, async (req, res) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey || typeof publicKey !== 'string') {
      return res.status(400).json({ error: 'publicKey is required' });
    }

    await User.findByIdAndUpdate(req.user._id, { publicKey });
    res.status(204).send();
  } catch (error) {
    console.error('Error updating user public key:', error);
    res.status(500).json({ error: 'Failed to update public key' });
  }
});

router.post('/api/rooms', isAuthenticated, async (req, res) => {
  try {
    const { roomName } = req.body;
    
    if (!roomName) {
      return res.status(400).json({ error: 'Room name is required' });
    }
    
    const chatMessage = new ChatMessage({
      message: `Room "${roomName}" created by ${req.user.username}`,
      user: req.user._id,
      room: roomName,
      timestamp: Date.now()
    });
    
    await chatMessage.save();
    
    res.status(201).json({ room: roomName });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

module.exports = router;