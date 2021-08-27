require('dotenv/config');

//Api Url
module.exports.API_URI =
	process.env.NODE_ENV == 'development'
		? process.env.API_URI_DEVELOPMENT
		: process.env.NODE_ENV == 'pre-prod'
		? process.env.API_URI_PRE_PROD
			: process.env.NODE_ENV == 'production' && process.env.API_URI_PRODUCTION;
		
//Mongo URI
module.exports.DB_URI =
	process.env.NODE_ENV == 'development'
		? process.env.DB_URI_DEVELOPMENT
		: process.env.NODE_ENV == 'pre-prod'
		? process.env.DB_URI_PRE_PROD
			: process.env.NODE_ENV == 'production' && process.env.DB_URI_PRODUCTION;
		
//API's
module.exports.GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || '';
module.exports.API_SECRET_KEY = process.env.API_SECRET_KEY || 'randomtoken';

//Chat API
module.exports.CHAT_API_SEND_MESSAGE = process.env.CHAT_API_URI + '/sendMessage?token=' + process.env.CHAT_API_TOKEN;
module.exports.CHAT_API_TYPING = process.env.CHAT_API_URI + '/typing?token=' + process.env.CHAT_API_TOKEN;
module.exports.CHAT_MOBILE_PHONE = process.env.CHAT_MOBILE_PHONE;
module.exports.MAP_DECODER_URI = process.env.MAP_DECODER_URI;
