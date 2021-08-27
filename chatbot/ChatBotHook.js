const express = require('express');
const router = express.Router();
const axios = require('axios');
const stringSimilarity = require('string-similarity');
const LanguageDetect = require('languagedetect');
const lngDetector = new LanguageDetect();
const {
	CHAT_API_SEND_MESSAGE,
	CHAT_API_TYPING,
	CHAT_MOBILE_PHONE,
	API_URI,
	API_SECRET_KEY,
	MAP_DECODER_URI,
} = require('../globals');
//Models
const ChatBotUserModel = require('../models/ChatBotUser');

const userQuestion = new Map();

router.post('/', async (req, res) => {
	try {
		const { messages } = req.body;

		let data;
		let response;

		if (!messages || messages.length == 0)
			return res.json({ status: false, message: 'Messages array in body is empty' });

		for (let message of messages) {
			//Get the message data
			let { body, fromMe, author, chatId, type, senderName } = message;

			/**************------Validation START-----********/
			//From a group --> don't respond
			if (chatId.includes('-'))
				return res.json({ status: false, message: 'Sorry, this message was sent from a group' });

			//From me --> but not to me (for testing)
			if (fromMe == true && author.includes(CHAT_MOBILE_PHONE))
				return res.json({ status: false, message: 'Sorry, you sent this message by your self' });

			/*************************************************/

			//Send typing...
			await axios.post(CHAT_API_TYPING, {
				chatId: chatId,
				on: true,
				duration: 5,
				phone: author.split('@')[0],
			});

			/*************************************************/

			//If user is not registered --> add to DB
			if (!(await ChatBotUserModel.findOne({ phoneNumber: author.split('@')[0] }))) {
				await ChatBotUserModel.create({ phoneNumber: author.split('@')[0], name: senderName });
			}

			/*************************************************/
			//Detect language first
			let langList = lngDetector.detect(body);
			if (
				(langList.length != 0 &&
					langList.filter(
						(item) =>
							item.includes('arabic') ||
							item.includes('farsi') ||
							item.includes('pashto') ||
							item.includes('urdu')
					).length != 0) ||
				body == 'خروج' ||
				body == '١' ||
				body == '٢' ||
				body == '٣' ||
				body == '٤'
			) {
				await ChatBotUserModel.updateOne({ phoneNumber: author.split('@')[0] }, { language: 'ar' });
			} else if (
				(langList.length != 0 && langList.filter((item) => item.includes('english')).length != 0) ||
				body.toLowerCase() == 'hi'
			) {
				await ChatBotUserModel.updateOne({ phoneNumber: author.split('@')[0] }, { language: 'en' });
			}

			/*************************************************/
			//Get the user from DB
			let userSearch = await ChatBotUserModel.findOne({ phoneNumber: author.split('@')[0] });
			const { language } = userSearch;

			/*************************************************/

			switch (type) {
				case 'location':
					//Update on API
					/****************************************/
					// //Send to the driver that location is updated
					// if (userSearch.orderId) {
					// }
					/****************************************/

					//Send data to api
					response = await axios.post(
						`${API_URI}/Trip/UpdateReceiverLocation`,
						{
							mobileNo: userSearch.phoneNumber,
							location: body,
							type: 1,
						},
						{
							headers: {
								Authorization: `Bearer ${API_SECRET_KEY}`,
								'Accept-Language': userSearch.language,
							},
						}
					);
					data = await response.data;

					//Error handling
					if (!data.status) {
						await sendMessage({ chatId, language, message: data.message });
						break;
					}

					//Ask the csutomer for his building number
					await sendMessage({ chatId, language, key: 'LOCATION_SUCCESS' });
					await sendMessage({ chatId, language, key: 'ASK_FOR_BUILDING' });
					//Register the user as awaiting for answer
					userQuestion.set(author.split('@')[0], 'ASK_FOR_BUILDING');

					break;
				case 'chat':
					//Check if user is answering any question first
					if (userQuestion.get(author.split('@')[0])) {
						let questionKey = userQuestion.get(author.split('@')[0]);

						switch (questionKey) {
							case 'ASK_FOR_BUILDING':
								//Send data to api
								response = await axios.post(
									`${API_URI}/Trip/UpdateReceiverLocation`,
									{ mobileNo: userSearch.phoneNumber, location: body, type: 2 },
									{
										headers: {
											Authorization: `Bearer ${API_SECRET_KEY}`,
											'Accept-Language': userSearch.language,
										},
									}
								);
								data = await response.data;

								//Error handling
								if (!data.status) {
									await sendMessage({ chatId, language, message: data.message });
									break;
								}

								//Ask the csutomer for his building number
								await sendMessage({ chatId, language, key: 'ASK_FOR_APPARTMENT' });
								//Register the user as awaiting for answer
								userQuestion.set(author.split('@')[0], 'ASK_FOR_APPARTMENT');
								break;

							case 'ASK_FOR_APPARTMENT':
								//Send data to api
								response = await axios.post(
									`${API_URI}/Trip/UpdateReceiverLocation`,
									{ mobileNo: userSearch.phoneNumber, location: body, type: 3 },
									{
										headers: {
											Authorization: `Bearer ${API_SECRET_KEY}`,
											'Accept-Language': userSearch.language,
										},
									}
								);
								data = await response.data;

								//Error handling
								if (!data.status) {
									await sendMessage({ chatId, language, message: data.message });
									break;
								}

								//Ask the csutomer for his building number
								await sendMessage({ chatId, language, key: 'THANKS_FOR_INFORMATION' });
								userQuestion.delete(author.split('@')[0]);

								break;
							case 'LOCATION_INFO':
								//Check if the user sent a url
								let url = body.match(/(https?:\/\/[^ ]*)/) && body.match(/(https?:\/\/[^ ]*)/)[0];
								if (!url) {
									await sendMessage({ chatId, language, key: 'LOCATION_NOT_VALID' });
									break;
								} else {
									await sendMessage({ chatId, language, key: 'CHECKING_LOCATION_URL' });
									//Get the lat & long from Google Map Decoder service
									response = await axios.post(MAP_DECODER_URI, { url });
									data = await response.data;

									if (!data.status) {
										await sendMessage({ chatId, language, key: 'LOCATION_NOT_VALID' });
										break;
									}
									//Send data to api
									response = await axios.post(
										`${API_URI}/Trip/UpdateReceiverLocation`,
										{
											mobileNo: userSearch.phoneNumber,
											location: `${data.data.lat};${data.data.lng}`,
											type: 1,
										},
										{
											headers: {
												Authorization: `Bearer ${API_SECRET_KEY}`,
												'Accept-Language': userSearch.language,
											},
										}
									);
									data = await response.data;

									//Error handling
									if (!data.status) {
										await sendMessage({ chatId, language, message: data.message });
										break;
									}

									//Ask the csutomer for his building number
									await sendMessage({ chatId, language, key: 'LOCATION_SUCCESS' });
									await sendMessage({ chatId, language, key: 'ASK_FOR_BUILDING' });
									//Register the user as awaiting for answer
									userQuestion.set(author.split('@')[0], 'ASK_FOR_BUILDING');
								}

								break;

							default:
								await sendMessage({ chatId, language, key: 'DONT_UNDERSTANT' });
								await sendMessage({ chatId, language, key: 'INFO_MESSAGE' });

								userQuestion.delete(author.split('@')[0]);
								break;
						}
					} else {
						//Check if user is searching for order by id

						//Get the question key --> if exist
						let questionObj = null;

						for (let QUESTION of QUESTIONS) {
							let { bestMatch, bestMatchIndex } = stringSimilarity.findBestMatch(
								body,
								userSearch.language == 'ar' ? QUESTION.QAR : QUESTION.QEN
							);

							if (bestMatch.rating > 0.6) {
								questionObj = QUESTIONS[QUESTIONS.indexOf(QUESTION)];
								break;
							}
						}

						/***************************/
						//If BOT can't understand
						if (!questionObj) {
							if (new RegExp('^[0-9]+$').test(body)) {
								//Check if the user has sent order id
								response = await axios.post(
									`${API_URI}/Trip/GetTrackingOrder`,
									{ orderId: body },
									{
										headers: {
											Authorization: `Bearer ${API_SECRET_KEY}`,
											'Accept-Language': userSearch.language,
										},
									}
								);
								data = await response.data;
								//Error handling
								if (!data.status) {
									await sendMessage({
										chatId,
										language,
										message: data.message,
									});

									break;
								}

								await sendMessage({
									chatId,
									language,
									key: 'TRACK_INFO',
									params: data.data,
								});
								break;
							}

							await sendMessage({ chatId, language, key: 'DONT_UNDERSTANT' });
							await sendMessage({ chatId, language, key: 'INFO_MESSAGE' });

							break;
						}

						//Perform actions depending on KEYS
						switch (questionObj.key) {
							case 'LANG_TO_EN':
								await ChatBotUserModel.updateOne(
									{ phoneNumber: author.split('@')[0] },
									{ language: 'en' }
								);
								await sendMessage({ chatId, language, key: 'LANG_TO_EN' });
								break;
							case 'LANG_TO_AR':
								await ChatBotUserModel.updateOne(
									{ phoneNumber: author.split('@')[0] },
									{ language: 'ar' }
								);
								await sendMessage({ chatId, language, key: 'LANG_TO_AR' });
								break;
							case 'CUSTOMER_SERVICE':
								//Get the phone numbers from API
								response = await axios.post(
									`${API_URI}/Trip/LogiCommunicate`,
									{},
									{
										headers: {
											Authorization: `Bearer ${API_SECRET_KEY}`,
											'Accept-Language': userSearch.language,
										},
									}
								);
								data = await response.data;

								//Error handling
								if (!data.status) {
									await sendMessage({ chatId, language, message: data.message });
									break;
								}

								await sendMessage({ chatId, language, message: data.data.message });

								break;
							case 'SALAM_MESSAGE':
							case 'HELLO_MESSAGE':
								await sendMessage({ chatId, language, key: questionObj.key });
								//Check if there is an order or not
								// response = await axios.post(
								// 	`${API_URI}/Trip/GetReceiverOrder`,
								// 	{ mobileNo: userSearch.phoneNumber, type: 1 },
								// 	{
								// 		headers: {
								// 			Authorization: `Bearer ${API_SECRET_KEY}`,
								// 			'Accept-Language': userSearch.language,
								// 		},
								// 	}
								// );
								// data = await response.data;

								// //Error handling
								// if (!data.status) {
								// 	await sendMessage({
								// 		chatId,
								// 		language,
								// 		message: data.message,
								// 	});
								// }

								await sendMessage({
									chatId,
									language,
									key: 'INFO_MESSAGE',
								});
								// const { data: orderData } = data.data;
								// await sendMessage({
								// 	chatId,
								// 	language,
								// 	key: 'INFO_MESSAGE',
								// 	params: { isHasOrder: true, ...orderData },
								// });

								break;
							case 'TRACK_INFO':
								response = await axios.post(
									`${API_URI}/Trip/GetReceiverOrder`,
									{ mobileNo: userSearch.phoneNumber, type: 2 },
									{
										headers: {
											Authorization: `Bearer ${API_SECRET_KEY}`,
											'Accept-Language': userSearch.language,
										},
									}
								);
								data = await response.data;
								//Error handling
								if (!data.status) {
									await sendMessage({
										chatId,
										language,
										message: data.message,
									});

									break;
								}

								await sendMessage({
									chatId,
									language,
									key: 'TRACK_INFO',
									params: data.data,
								});

								break;
							case 'INVOICE_INFO':
								response = await axios.post(
									`${API_URI}/Trip/GetReceiverOrder`,
									{ mobileNo: userSearch.phoneNumber, type: 3 },
									{
										headers: {
											Authorization: `Bearer ${API_SECRET_KEY}`,
											'Accept-Language': userSearch.language,
										},
									}
								);
								data = await response.data;

								//Error handling
								if (!data.status) {
									await sendMessage({
										chatId,
										language,
										message: data.message,
									});

									break;
								}

								// if (!data.data.isAccept) {
								// 	await sendMessage({
								// 		chatId,
								// 		language,
								// 		key: 'TRACK_INFO',
								// 		params: data.data,
								// 	});

								// 	break;
								// }

								await sendMessage({
									chatId,
									language,
									key: 'INVOICE_URL',
									params: { url: data.data.url },
								});

								break;
							case 'LOCATION_INFO':
								response = await axios.post(
									`${API_URI}/Trip/GetReceiverOrder`,
									{ mobileNo: userSearch.phoneNumber, type: 4 },
									{
										headers: {
											Authorization: `Bearer ${API_SECRET_KEY}`,
											'Accept-Language': userSearch.language,
										},
									}
								);
								data = await response.data;
								//Error handling
								if (!data.status) {
									await sendMessage({
										chatId,
										language,
										message: data.message,
									});

									break;
								}

								userQuestion.set(author.split('@')[0], 'LOCATION_INFO');

								await sendMessage({
									chatId,
									language,
									key: 'LOCATION_INFO',
								});
								break;
							default:
								//Send BOT answer to user
								await sendMessage({
									chatId,
									language,
									key: questionObj.key,
								});
								break;
						}

						/***************************/
					}

					break;
				default:
					if (new RegExp('^[0-9]+$').test(body)) {
						//Check if the user has sent order id
						response = await axios.post(
							`${API_URI}/Trip/GetTrackingOrder`,
							{ orderId: body },
							{
								headers: {
									Authorization: `Bearer ${API_SECRET_KEY}`,
									'Accept-Language': userSearch.language,
								},
							}
						);
						data = await response.data;
						//Error handling
						if (!data.status) {
							await sendMessage({
								chatId,
								language,
								message: data.message,
							});

							break;
						}

						await sendMessage({
							chatId,
							language,
							key: 'TRACK_INFO',
							params: data.data,
						});
						break;
					}
					//If type is not chat || location
					await sendMessage({ chatId, language, key: 'DONT_UNDERSTANT' });
					await sendMessage({ chatId, language, key: 'INFO_MESSAGE' });

					break;
			}
		}

		return res.json({ status: true, message: 'Done !' });
	} catch (e) {
		//Remove all questions for this user
		if (req.body.messages[0]) {
			const { author, senderName, chatId } = req.body.messages[0];

			userQuestion.delete(author.split('@')[0]);
			//If user is not registered --> add to DB
			if (!(await ChatBotUserModel.findOne({ phoneNumber: author.split('@')[0] }))) {
				await ChatBotUserModel.create({ phoneNumber: author.split('@')[0], name: senderName });
			}
			let userSearch = await ChatBotUserModel.findOne({ phoneNumber: author.split('@')[0] });

			await sendMessage({
				chatId,
				language: userSearch.language || 'ar',
				key: 'INFO_MESSAGE',
			});
		}

		console.log(`Error in ChatBotHook: ${e.message}`, e);
		if (!res.headersSent) {
			return res.json({ status: false, message: `Error in ChatBotHook: ${e.message}` });
		}
	}
});

/*
  ==>Example of messages list --> req.body.messages
  messages: [
    {
      id: 'true_201064544529@c.us_BDFEC1BEA0845E9B6CFE245D00A24A2E',
      body: 'هلا',
      fromMe: true,
      self: 0,
      isForwarded: 0,
      author: '201064544529@c.us',
      time: 1619006194,
      chatId: '201064544529@c.us',
      messageNumber: 17607,
      type: 'chat',
      senderName: 'MAHMOUD ELASHMAWY',
      caption: null,
      quotedMsgBody: null,
      quotedMsgId: null,
      quotedMsgType: null,
      chatName: '+20 106 454 4529'
    }
  ]
*/

/*************----------Helpers---------**************************/
const sendMessage = async ({ chatId, language, key = '', params = {}, message = '' }) => {
	try {
		if (key) {
			await axios.post(CHAT_API_SEND_MESSAGE, {
				chatId: chatId,
				body:
					language == 'ar'
						? QUESTIONS.find((q) => q.key == key).RAR(params)
						: QUESTIONS.find((q) => q.key == key).REN(params),
			});
		} else if (message) {
			await axios.post(CHAT_API_SEND_MESSAGE, {
				chatId: chatId,
				body: message,
			});
		} else {
			console.log('Error on sendMessage, neither message nor key were submitted');
		}
	} catch (e) {
		console.log(`key: ${key},message: ${message}`, e);
	}
};

/**********************************************************/

const QUESTIONS = [
	{
		key: 'HELLO_MESSAGE',
		QAR: [
			'مرحبا',
			'هلا',
			'مرحب',
			'مرحبا بك',
			'اريد المساعدة',
			'مساعدة',
			'ساعدني',
			'ساعدني من فضلك',
			'هل يوجد أحد',
			'الوو',
			'0',
			'خروج',
		],
		QEN: [
			'Hi',
			'hi',
			'Hello',
			'Hala',
			'How are things',
			'Help',
			'I need help',
			'Help me please',
			'any one here',
			'0',
			'exit',
		],
		RAR: () => `مرحبا بك\nأنا لوجي ون بوت 🤖`,
		REN: () => `Welcome\nI'm LogiOne Bot 🤖`,
	},
	{
		key: 'SALAM_MESSAGE',
		QAR: ['السلام عليكم', 'سلام', 'السلام عليكم ورحمة الله وبركاته', 'سلام عليكم'],
		QEN: ['Salam'],
		RAR: () => `وعليكم السلام ورحمة الله وبركاته\nأنا لوجي ون بوت 🤖`,
		REN: () => `Salam :)\nI'm LogiOne Bot 🤖`,
	},
	{
		key: 'INFO_MESSAGE',
		QAR: [''],
		QEN: [''],
		RAR: () =>
			'يساعدك لوجي ون بوت في استلام وتتبع طلباتك ودفع فاتورتك والتواصل معنا\n\nلتتبع الطلب ، اكتب *1*\nلمشاركة موقع التسليم، اكتب *2*\nللتواصل معنا، اكتب *3*\nلدفع فاتورتك، اكتب *4*\n\n💡 اذا علقت او واجهتك اي مشكلة، اكتب *خروج*\n\nلخدمات أخرى، يرجى زيارة https://www.logione.net\n\nTo switch the language to English at any time, just type *English*\n\n*Logi One*',
		REN: () =>
			'LogiOne Pot helps you receive and track your shipments, pay your bill, and communicate with us\n\nTo track your shipment, press *1*\nTo share your location, press *2*\nTo contact us, press *3*\nTo pay your bill, press *4*\n\n💡 If you are stuck، just write *exit*\n\nFor other services, please visit https://www.logione.net\n\n لتغيير اللغة الي العربية في أي وقت، فقط قم بكتابة *عربي*\n\n*لوجي ون*',
	},
	{
		key: 'TRACK_INFO',
		QAR: ['تتبع', '1', '١'],
		QEN: ['Track', '1'],
		RAR: ({ name, mobile, status, client, url, paidStatus, invoiceUrl, isAccept }) =>
			`*حالة التوصيل*: ${status}\n*المكان*: ${client}\n${
				isAccept
					? `*الكابتن*: ${name}\n*رقم الاتصال*: ${mobile}\n*حالة الدفع*: ${paidStatus}\n\n*تتبع حركة الكابتن* من الرابط\n${url}\n\n${
							invoiceUrl ? '*دفع الفاتورة* من الرابط\n' + invoiceUrl + '\n\n' : ''
					  } يمكنك تتبع طلبات أخري *بكتابة الرقم*`
					: '\nيمكنك تتبع طلبات أخري *بكتابة الرقم*'
			}`,
		REN: ({ name, mobile, status, client, url, paidStatus, invoiceUrl, isAccept }) =>
			`*Delivery Status*: ${status}\n*Store*: ${client}\n${
				isAccept
					? `*Captain*: ${name}\n*Phone Number*: ${mobile}\n*Payment Status*: ${paidStatus}\n\n*To track the captain*, use this link\n${url}\n\n${
							invoiceUrl ? '*To pay the bill*, use this link\n' + invoiceUrl + '\n\n' : ''
					  }You can track any other order *by typing it's number*`
					: "\nYou can track any other order *by typing it's number*"
			}`,
	},
	{
		key: 'LOCATION_INFO',
		QAR: ['موقعي', '2', '٢'],
		QEN: ['Share location', '2', '٢'],
		RAR: () => 'يرجي استخدام خيار *مشاركة الموقع* في الواتساب لكي نتمكن من الوصول اليك سريعا',
		REN: () => 'Please use the *Send Location* option in Whats App to let us find you faster',
	},
	{
		key: 'CUSTOMER_SERVICE',
		QAR: ['دعم', '3', '٣', 'رقم الدعم', 'رقم الجوال', 'شكاوى'],
		QEN: ['Customer serivce', '3', 'Support Number', 'Mobile Number', 'Problem'],
		RAR: ({ hotNumber, mobileNumber, phoneNumber, officeNumber, webSite, addressUrl }) =>
			`يسعدنا خدمتك بالتواصل معنا\n*رقم الاتصال*: ${hotNumber}\n*الموقع الالكتروني*: ${webSite}\n*العنوان*: ${addressUrl}`,
		REN: ({ hotNumber, mobileNumber, phoneNumber, officeNumber, webSite, addressUrl }) =>
			`We are happy to hear from you\n*Contact Number*: ${hotNumber}\n*Website*: ${webSite}\n*Address*: ${addressUrl} `,
	},
	{
		key: 'INVOICE_INFO',
		QAR: ['4', 'دفع', 'فاتورة', '٤'],
		QEN: ['4', 'pay', 'payment', 'invoice'],
		RAR: () => 'يبدو أنك قد قمت بدفع مبلغ الطلب من قبل\nشكرا لإهتمامك.',
		REN: () => 'It looks that you have already paid this order\nThank you for your concern',
	},
	{
		key: 'TRACK_BY_ID',
		QAR: [''],
		QEN: [''],
		RAR: () => 'رقم الطلب غير صحيح، يرجي التأكد من رقم الطلب والمحاولة مرة أخري',
		REN: () => 'The order number is incorrect, please make sure you entered the right order number and try again',
	},
	{
		key: 'LOCATION_SUCCESS',
		QAR: [''],
		QEN: [''],
		RAR: () => 'شكرا لك علي مشاركة موقعك معنا ، لقد قمنا بتسجيله في طلبك وسيسهل هذا عملية وصول السائق اليك',
		REN: () =>
			'Thank you for sharing your location with us, we have added this location to your order to make it easier for our driver to reach for you',
	},
	{
		key: 'CHECKING_LOCATION_URL',
		QAR: [''],
		QEN: [''],
		RAR: () => 'جاري التحقق من الرابط الذي ارسلته...\nيرجي الانتظار بضعة ثواني...',
		REN: () => 'Checking the location url you have sent...\nPlease wait a few seconds...',
	},
	{
		key: 'LOCATION_NOT_VALID',
		QAR: [''],
		QEN: [''],
		RAR: () => 'يبدو أن هذا الرابط غير صالح ، أنصحك باستخدام *مشاركة الموقع* من واتساب ',
		REN: () => 'It looks that this link is not valid, consider using *Share Location* from whatsapp',
	},
	{
		key: 'DONT_UNDERSTANT',
		QAR: [''],
		QEN: [''],
		RAR: () => 'اعتذر منك، لازلت أتعلم لأجيبك علي جميع أسئلتك. 🤔',
		REN: () => "Sorry, I'm still learning to answer all your questions. 🤔",
	},
	{
		key: 'LANG_TO_AR',
		QAR: ['ُعربي', 'Arabic', 'العربية', 'العربيه', 'عربى'],
		QEN: ['ُعربي', 'Arabic'],
		RAR: () => 'تم تغيير اللغة الي العربية بنجاح',
		REN: () => 'تم تغيير اللغة الي العربية بنجاح',
	},
	{
		key: 'LANG_TO_EN',
		QAR: ['انجليزي', 'English', 'انجليزى', 'انجلش'],
		QEN: ['انجليزي', 'English'],
		RAR: () => 'Langauge changed to English successfully',
		REN: () => 'Langauge changed to English successfully',
	},
	{
		key: 'ASK_FOR_BUILDING',
		QAR: [''],
		QEN: [''],
		RAR: () => 'رائع ، نحن علي وشك الانتهاء *من فضلك أدخل اسم / رقم المبني الخاص بك* ',
		REN: () => 'Great ! we are almost there\n*Please enter your building Name/ number*',
	},
	{
		key: 'ASK_FOR_APPARTMENT',
		QAR: [''],
		QEN: [''],
		RAR: () => '*من فضلك أدخل رقم شقتك /مكتبك*',
		REN: () => '*Please enter your Appartment/ Office number*',
	},
	{
		key: 'THANKS_FOR_INFORMATION',
		QAR: [''],
		QEN: [''],
		RAR: () => 'شكرا لمشاركة هذه المعلومات القيمة معنا\nسوف تساعدنا هذه البيانات في الوصول اليك بشكل أسرع',
		REN: () => 'Thank you for sharing this values information with us\nit will help us get to you faster',
	},
	{
		key: 'PROBLEM_OCCURRED',
		QAR: [''],
		QEN: [''],
		RAR: () => 'عذرا ، لقد حدثت مشكلة ما\nيرجي إعادة المحاولة مرة أخري',
		REN: () => 'Sorry, a problem has occurred\nplease try again',
	},
	{
		key: 'INVOICE_URL',
		QAR: [''],
		QEN: [''],
		RAR: ({ url }) => `يمكنك الدفع مباشرة عن طريق هذا الرابط\n${url}`,
		REN: ({ url }) => `You can pay online using this invoice link\n${url}`,
	},
	{
		key: 'RANDOM_MESSAGE_1',
		QAR: ['ان شاء الله'],
		QEN: ['Inshallah'],
		REN: () => 'Inshallah :)',
		RAR: () => 'ان شاء الله :)',
	},
	{
		key: 'RANDOM_MESSAGE_2',
		QAR: ['انا بخير'],
		QEN: ["I' Fine"],
		REN: () => 'I Hope That :)',
		RAR: () => 'اتمنى ذلك دائما :)',
	},
	{
		key: 'RANDOM_MESSAGE_3',
		QAR: ['الحمدلله'],
		QEN: ['Alright'],
		REN: () => 'I Hope I Hepled You  :)',
		RAR: () => 'اتمنى ان اكون ساعدتك :)',
	},
	{
		key: 'RANDOM_MESSAGE_4',
		QAR: ['نعم'],
		QEN: ['Yes'],
		REN: () => '👍',
		RAR: () => '👍',
	},
	{
		key: 'RANDOM_MESSAGE_5',
		QAR: ['لا'],
		QEN: ['No'],
		REN: () => '👍',
		RAR: () => '👍',
	},
	{
		key: 'RANDOM_MESSAGE_6',
		QAR: ['اخيرا'],
		QEN: ['Finally'],
		REN: () => '👏',
		RAR: () => '👏',
	},
	{
		key: 'RANDOM_MESSAGE_7',
		QAR: ['👍'],
		QEN: ['👍'],
		REN: () => '👍',
		RAR: () => '👍',
	},
	{
		key: 'RANDOM_MESSAGE_8',
		QAR: ['👌'],
		QEN: ['👌'],
		REN: () => '👌',
		RAR: () => '👌',
	},
	{
		key: 'RANDOM_MESSAGE_9',
		QAR: ['😍'],
		QEN: ['😍'],
		REN: () => '😍',
		RAR: () => '😍',
	},
	{
		key: 'RANDOM_MESSAGE_10',
		QAR: ['؟'],
		QEN: ['؟'],
		REN: () => 'Feel Free To Ask Me ❤',
		RAR: () => 'تفضل , اى خدمه حابب تستفسر عنها؟',
	},
	{
		key: 'RANDOM_MESSAGE_11',
		QAR: ['❤'],
		QEN: ['❤'],
		REN: () => '❤',
		RAR: () => '❤',
	},
	{
		key: 'RANDOM_MESSAGE_12',
		QAR: ['😭'],
		QEN: ['😭'],
		REN: () => '😁',
		RAR: () => '😁',
	},
	{
		key: 'RANDOM_MESSAGE_13',
		QAR: ['👍🏼'],
		QEN: ['👍🏼'],
		REN: () => '👍🏼',
		RAR: () => '👍🏼',
	},
	{
		key: 'RANDOM_MESSAGE_14',
		QAR: ['👍👍'],
		QEN: ['👍👍'],
		REN: () => '👍',
		RAR: () => '👍',
	},
	{
		key: 'RANDOM_MESSAGE_15',
		QAR: ['👍👍👍'],
		QEN: ['👍👍👍'],
		REN: () => '👍',
		RAR: () => '👍',
	},
	{
		key: 'RANDOM_MESSAGE_16',
		QAR: ['اقدر ذلك'],
		QEN: ['I know that'],
		REN: () => 'Thank You ❤',
		RAR: () => 'شكرا لتقدريك هذا ❤',
	},
	{
		key: 'RANDOM_MESSAGE_17',
		QAR: ['اريد شىء اخر'],
		QEN: ['Somthing else'],
		REN: () => 'Feel Free To Ask Me :)',
		RAR: () => 'تفضل , اى خدمه حابب تستفسر عنها؟',
	},
	{
		key: 'RANDOM_MESSAGE_18',
		QAR: ['سؤال اخر'],
		QEN: ['Onther Question'],
		REN: () => 'Feel Free To Ask Me :)',
		RAR: () => 'تفضل , اى خدمه حابب تستفسر عنها؟',
	},
	{
		key: 'RANDOM_MESSAGE_19',
		QAR: ['سؤال'],
		QEN: ['Question'],
		REN: () => 'Feel Free To Ask Me :)',
		RAR: () => 'تفضل , اى خدمه حابب تستفسر عنها؟',
	},
	{
		key: 'RANDOM_MESSAGE_20',
		QAR: ['احببت التعامل معك'],
		QEN: ['I Love working with you'],
		REN: () => 'I love it Too ❤',
		RAR: () => 'وانا ايضا ❤',
	},
	{
		key: 'RANDOM_MESSAGE_21',
		QAR: ['احببتك'],
		QEN: ['I Love you'],
		REN: () => 'I love it Too ❤',
		RAR: () => 'وانا ايضا ❤',
	},
	{
		key: 'RANDOM_MESSAGE_22',
		QAR: ['هذا مفيد'],
		QEN: ["It's Helpful"],
		REN: () => 'Thank You ❤',
		RAR: () => 'شكرا لك ❤',
	},
	{
		key: 'RANDOM_MESSAGE_23',

		QAR: ['كيف حالك'],
		QEN: ['How Are You'],
		REN: () => "I' fine thanks (y)",
		RAR: () => 'الحمد لله :)',
	},
	{
		key: 'RANDOM_MESSAGE_24',
		QAR: ['كيف الاحوال'],
		QEN: ['How Are You Doing'],
		REN: () => "I' fine thanks (y)",
		RAR: () => 'الحمد لله :)',
	},
	{
		key: 'RANDOM_MESSAGE_25',
		QAR: ['صباح الفل'],
		QEN: ['Good Day'],
		REN: () => 'Good Morning    \n\nHow I Can Help You? :)',
		RAR: () => 'صباح الخير \n\nكيف يمكن ان اساعدك :)',
	},
	{
		key: 'RANDOM_MESSAGE_26',

		QAR: ['صباح الخير'],
		QEN: ['Good Morning'],
		REN: () => 'Good Morning    \n\nHow I Can Help You? :)',
		RAR: () => 'صباح الخير \n\nكيف يمكن ان اساعدك :)',
	},
	{
		key: 'RANDOM_MESSAGE_27',
		QAR: ['صباح النور'],
		QEN: ['Morning'],
		REN: () => 'Good Morning    \n\nHow I Can Help You? :)',
		RAR: () => 'صباح الخير \n\nكيف يمكن ان اساعدك :)',
	},
	{
		key: 'RANDOM_MESSAGE_28',
		QAR: ['شكرا'],
		QEN: ['thanks'],
		REN: () => 'You are welcome',
		RAR: () => 'عفوا',
	},
	{
		key: 'RANDOM_MESSAGE_29',
		QAR: ['مع السلامة'],
		QEN: ['bye'],
		REN: () => 'Have a good day Sure ',
		RAR: () => 'في أمان الله',
	},
	{
		key: 'RANDOM_MESSAGE_30',
		QAR: ['مع السلامه'],
		QEN: ['bye bye'],
		REN: () => 'Have a good day',
		RAR: () => 'في أمان الله',
	},
	{
		key: 'RANDOM_MESSAGE_31',
		QAR: ['تسلم'],
		QEN: ['Thank you'],
		REN: () => "You're Welocome ",
		RAR: () => 'شكرا لك :)',
	},
	{
		key: 'RANDOM_MESSAGE_32',
		QAR: ['سلامات'],
		QEN: ['Thanx'],
		REN: () => "You're Welocome ",
		RAR: () => 'شكرا لك :)',
	},

	{
		key: 'RANDOM_MESSAGE_33',
		QAR: ['تمام'],
		QEN: ['K'],
		REN: () => "You're Welocome ",
		RAR: () => 'شكرا لك :)',
	},
];

module.exports = router;
