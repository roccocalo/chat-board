const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
    title: { type: String, required: [true, 'title is required'] },
    message: { type: String, required: [true, 'message is required'] },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
})

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;