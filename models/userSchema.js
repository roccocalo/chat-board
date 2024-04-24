const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    username: { type: String, required: [true, 'name is required'], unique: true },
    password: { type: String, required: [true, 'password is required'], unique: false },
    is_member: { type: Boolean, default: false },
})

const User = mongoose.model('User', userSchema);

module.exports = User;