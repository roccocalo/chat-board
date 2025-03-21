const ChatMessage = require('../models/chatMessageSchema');
const User = require('../models/userSchema');

module.exports = function(io) {
  const onlineUsers = new Map();

  io.on('connection', (socket) => {
    console.log('New client connected');
    let currentUser = null;

    socket.on('authenticate', async (userId) => {
      try {
        const user = await User.findById(userId);
        if (user) {
          currentUser = user;
          
          onlineUsers.set(socket.id, {
            userId: user._id,
            username: user.username
          });
          
          io.emit('users_online', Array.from(onlineUsers.values()));
          
          socket.broadcast.emit('user_connected', {
            userId: user._id,
            username: user.username
          });
          
          const recentMessages = await ChatMessage.find()
            .sort({ timestamp: -1 })
            .limit(50)
            .populate('user', 'username')
            .lean();
            
          socket.emit('chat_history', recentMessages.reverse());
        }
      } catch (error) {
        console.error('Authentication error:', error);
      }
    });

    socket.on('send_message', async (messageData) => {
      if (!currentUser) {
        socket.emit('error', { message: 'You must be logged in to send messages' });
        return;
      }
      
      try {
        const chatMessage = new ChatMessage({
          message: messageData.message,
          user: currentUser._id,
          room: messageData.room || 'general',
          timestamp: Date.now()
        });
        
        await chatMessage.save();
        
        const populatedMessage = await ChatMessage.findById(chatMessage._id)
          .populate('user', 'username')
          .lean();
        
        io.emit('new_message', populatedMessage);
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('typing', (isTyping) => {
      if (currentUser) {
        socket.broadcast.emit('user_typing', {
          userId: currentUser._id,
          username: currentUser.username,
          isTyping
        });
      }
    });

    socket.on('join_room', (room) => {
      if (currentUser) {
        console.log(`${currentUser.username} is joining room: ${room}`);
        socket.join(room);
        socket.to(room).emit('user_joined', {
          userId: currentUser._id,
          username: currentUser.username,
          room
        });
      }
    });
    
    socket.on('leave_room', (room) => {
      if (currentUser) {
        console.log(`${currentUser.username} is leaving room: ${room}`);
        socket.leave(room);
      }
    });
    
    socket.on('new_room_created', (roomName) => {
      socket.broadcast.emit('room_added', { room: roomName });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected');
      if (onlineUsers.has(socket.id)) {
        const user = onlineUsers.get(socket.id);
        onlineUsers.delete(socket.id);
        io.emit('user_disconnected', {
          userId: user.userId,
          username: user.username
        });
        io.emit('users_online', Array.from(onlineUsers.values()));
      }
    });
  });
};