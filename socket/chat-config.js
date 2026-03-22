const ChatMessage = require('../models/chatMessageSchema');
const User = require('../models/userSchema');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

module.exports = function(io) {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const onlineUsersKey = 'online_users';
  const roomMessagesKey = (room) => `room:${room}:messages`;
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  const presenceClient = pubClient.duplicate();

  let redisReady = false;

  const loadOnlineUsers = async () => {
    if (!redisReady) {
      return [];
    }

    const userIds = await presenceClient.sMembers(onlineUsersKey);
    if (userIds.length === 0) {
      return [];
    }

    const users = await User.find({ _id: { $in: userIds } })
      .select('_id username')
      .lean();

    const userMap = new Map(users.map((user) => [String(user._id), user.username]));

    return userIds
      .map((userId) => ({
        userId,
        username: userMap.get(String(userId)) || 'Unknown user'
      }))
      .filter((user) => user.username !== 'Unknown user');
  };

  Promise.all([pubClient.connect(), subClient.connect(), presenceClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      redisReady = true;
      console.log('[socket] Redis adapter connected');
    })
    .catch((error) => {
      console.error('[socket] Redis adapter setup failed:', error);
    });

  io.on('connection', (socket) => {
    console.log('New client connected');
    let currentUser = null;

    socket.on('authenticate', async (userId) => {
      try {
        const user = await User.findById(userId);
        if (user) {
          currentUser = user;

          if (redisReady) {
            await presenceClient.sAdd(onlineUsersKey, String(user._id));
            io.emit('users_online', await loadOnlineUsers());
          }
          
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

        if (redisReady) {
          const cacheKey = roomMessagesKey(populatedMessage.room || 'general');
          try {
            await presenceClient.lPush(cacheKey, JSON.stringify(populatedMessage));
            await presenceClient.lTrim(cacheKey, 0, 49);
          } catch (cacheError) {
            console.error('Redis write-through cache failed:', cacheError);
          }
        }
        
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
      if (currentUser) {
        const disconnectedUser = {
          userId: String(currentUser._id),
          username: currentUser.username
        };

        if (redisReady) {
          presenceClient.sRem(onlineUsersKey, String(currentUser._id)).catch((error) => {
            console.error('Failed to remove user from online set:', error);
          });
        }

        io.emit('user_disconnected', {
          userId: disconnectedUser.userId,
          username: disconnectedUser.username
        });

        if (redisReady) {
          loadOnlineUsers()
            .then((users) => io.emit('users_online', users))
            .catch((error) => console.error('Failed to refresh online users:', error));
        }
      }
    });
  });
};