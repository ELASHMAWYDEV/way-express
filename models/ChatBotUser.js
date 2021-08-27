const mongoose = require('mongoose');

const chatBotUsersSchema = new mongoose.Schema({
	phoneNumber: { type: String, required: true },
	language: { type: String, enum: ['en', 'ar'], default: 'ar' },
	orderId: { type: Number, default: null },
	name: { type: String, default: '' },
});

const ChatBotUser = mongoose.model('ChatBotUser', chatBotUsersSchema, 'chatBotUsers');
module.exports = ChatBotUser;
