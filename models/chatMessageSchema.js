const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const chatMessageSchema = new Schema({
    message: { 
        type: String, 
        required: [true, 'Message content is required'] 
    },
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    },
    room: { 
        type: String, 
        default: 'general'
    },
    timestamp: { 
        type: Date, 
        default: Date.now 
    },
    readBy: [{
        user: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User' 
        },
        timestamp: { 
            type: Date, 
            default: Date.now
        }
    }]
});

chatMessageSchema.index({ room: 1, timestamp: -1 });

chatMessageSchema.index({ user: 1, timestamp: -1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;