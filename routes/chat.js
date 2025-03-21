const express = require('express');
const router = express.Router();
const ChatMessage = require('../models/chatMessageSchema');

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
    const before = req.query.before ? new Date(req.query.before) : new Date();
    
    const messages = await ChatMessage.find({
      room: room,
      timestamp: { $lt: before }
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