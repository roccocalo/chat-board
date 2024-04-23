const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
    message: { type: String, required: [true, 'message is required'] },
    user: { type: String, required: [true, 'password is required'] },
    timestamp: { type: Date, default: Date.now },
})

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;