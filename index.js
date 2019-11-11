'use strict';

// Use the https module to post the message to Slack
const https = require('https');

// Get the lambda logger and enable log.debug ()
const log = require('lambda-log');
log.options.debug = process.env.LOG_DEBUG === 'true' || false;

// Get the Slack webhook URL to post the Slack messages to
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;


/**
 * This Lambda function recieves RDS events and forwards state change and warnings to Slack.
 *
 * @param {Object} event - The RDS event .
 */
exports.handler = async (event) => {

	log.info({ message: 'Received RDS event' });
	log.debug({ event: event });

	let response = await processEvent(event);
	log.debug({ response });
};

/**
 * Process each RDS event and post to the Slack webhook if the RDS event is a state change or warning.
 *
 * @param {Object} event The SNS event object.
 */
function processEvent(event) {

	let eventRecords = event.Records;
	for (let record of eventRecords) {

		let message = JSON.parse(record.Sns.Message);
		let dbIdentifier = message['Source ID'];
		let eventMessage = message['Event Message'];

		let eventId = message['Event ID'];
		let hashIndex = eventId.lastIndexOf('#');
		let rdsEventId = (hashIndex > 0 ? eventId.substring(hashIndex + 1) : null);

		return (sendSlackMessage(slackWebhookUrl, dbIdentifier, eventMessage, rdsEventId));
	}	
}

async function sendSlackMessage(webhookUrl, dbIdentifier, eventMessage, rdsEventId) {

	let messageBody = {
		text: `*DB Identifier:* ${dbIdentifier}\n*Notification:* ${eventMessage} (${rdsEventId})`,
		mrkdwn: true
	};

	log.info({ slackMessage: messageBody.text });

	// Turn the Slack message into a JSON string
	try {
		messageBody = JSON.stringify(messageBody);
	} catch (e) {
		throw new Error('Failed to stringify messageBody', e);
	}

	// Promisify the https.request
	return new Promise((resolve, reject) => {

		const requestOptions = {
			method: 'POST',
			header: {
				'Content-Type': 'application/json'
			}
		};

		// Start the actual request
		const req = https.request(webhookUrl, requestOptions, (res) => {
			let response = '';

			// Build the response as each chunk is received
			res.on('data', (d) => {
				response += d;
			});

			// Response finished, resolve the promise with the received data
			res.on('end', () => {
				resolve(response);
			});
		});

		// There is an error, reject the promise with the error
		req.on('error', (err) => {
			reject(err);
		});

		// Post the Slack message and end the conection
		req.write(messageBody);
		req.end();
	});
}
