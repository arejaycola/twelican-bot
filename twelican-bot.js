require('dotenv').config();
const Twitter = require('twitter');
const fs = require('fs');
const Mongoose = require('./mongoose-config').mongoose;
const needle = require('needle');

// const { Schema } = require('mongoose');

const client = new Twitter({
	consumer_key: process.env.CONSUMER_KEY,
	consumer_secret: process.env.CONSUMER_SECRET,
	access_token_key: process.env.ACCESS_TOKEN_KEY,
	access_token_secret: process.env.ACCESS_TOKEN_SECRET,
});
let people;
let row = 0;
let newFlag = false;

let TwitterUserSchema = new Mongoose.Schema({}, { strict: false });
let TwitterUser = Mongoose.model('twitter-users', TwitterUserSchema);

let StatusSchema = new Mongoose.Schema({}, { strict: false });
let Status = Mongoose.model('status', StatusSchema);

if (process.argv[2] == '-n') {
	console.log('Creating new database');

	/* Instead of getting this from a document, get it from the database so we constantly grow the number of users that the bot is querying */
	newFlag = true;
	people = fs.readFileSync('popular-user.txt', 'utf-8');

	people = people.split('\r\n');
} else {
}

let currentCount = 0;
let total = 0;
let person = '';
let cursor;

/* Create an array to try and avoid duplicate requests */
let seenPeople = [];

const timer = setInterval(async () => {
	try {
		let person;

		if (newFlag) {
			total = people.length;
			person = people[row];
		} else {
			total = await TwitterUser.estimatedDocumentCount();
			person = cursor && (await cursor.next());
		}

		/* If the cursor exists get the next person, else get a new cursor */
		if (person) {
			await updateNextUserStats(person);
		} else {
			/* Start the list over */
			console.log('Acquiring cursor...');
			currentCount = 0;
			seenPeople = [];
			if (newFlag) {
				row = 0;
			} else {
				cursor = await TwitterUser.find({}, '_id id_str name screen_name').cursor();
			}
		}
	} catch (e) {
		console.log('Person -----' + person);
		console.log(`Cursor error... ${e.stack}`);
		console.log('Attempting to get new cursor...');
		cursor = await TwitterUser.find({}, '_id id_str name screen_name').cursor();
	}
}, 4000); //3000 is the min to not exceed the rate limit

/* Returns a list of 20 possible matches to query */
const getUserInfoFromTwitter = async (person) => {
	try {
		const response = await client.get(`https://api.twitter.com/1.1/users/search.json`, {
			q: `${person}`,
			count: 1,
			include_entities: false,
		});

		/* Filter out any unverified results */
		return response.filter((user) => user.verified);
	} catch (e) {
		console.log(`Error performing user search for ${person.name} at ${currentCount}. `);
		console.log(e);
	}
};

const updateNextUserStats = async (person) => {
	if (person) {
		try {
			let response;
			if (newFlag) {
				response = await getUserInfoFromTwitter(person);
			} else {
				response = await getUserInfoFromTwitter(person.get('name'));
			}
			/* Query the search.json api for User information*/

			/* Loop through responses and update or insert if it is a name we haven't seen before. */

			response.map(async (user) => {
				if (seenPeople.indexOf(user.name) === -1) {
					currentCount++;
					console.log(`Querying ${user.name}...  ${currentCount} of ${total} (${((currentCount / total) * 100).toFixed(2)}%) complete.`);

					await TwitterUser.findOneAndUpdate({ id_str: user.id_str }, { ...user, last_updated: new Date() }, { upsert: true });
					seenPeople.push(user.name);
				} else {
					console.log(`Skipping ${user.name}...`);
				}
			});

			if (newFlag) {
				row++;
			}
		} catch (e) {
			console.log(`Error fetching user...`);
		}
	}
};

// const getPeople = async () => {
// 	for (let i = 0; i < people.length; i++) {
// 		const person = people[i];
// 		await updateNextUserStats(person);

// 		console.log(person);
// 	}
// };

// getPeople();

const getPage = async (url, params, options, nextToken) => {
	if (nextToken) {
		params.next_token = nextToken;
	}

	try {
		const resp = await needle('get', url, params, options);

		if (resp.statusCode != 200) {
			console.log(`${resp.statusCode} ${resp.statusMessage}:\n${resp.body}`);
			return;
		}
		return resp.body;
	} catch (err) {
		throw new Error(`Request failed: ${err}`);
	}
};

const getUserTweets = async (person) => {
	// const url = `https://api.twitter.com/2/users/${person}/tweets`;
	const url = `https://api.twitter.com/2/tweets?ids=${1260294888811347969}`;

	let userTweets = [];
	let params = {
		max_results: 100,
		'tweet.fields': 'created_at',
	};

	const options = {
		headers: {
			authorization: `Bearer ${process.env.BEARER_TOKEN}`,
		},
	};

	let hasNextPage = true;
	let nextToken = null;
	console.log('Retrieving Tweets...');
	while (hasNextPage) {
		let resp = await getPage(url, params, options, nextToken);
		if (resp && resp.meta && resp.meta.result_count && resp.meta.result_count > 0) {
			if (resp.data) {
				userTweets.push.apply(userTweets, resp.data);
			}
			if (resp.meta.next_token) {
				nextToken = resp.meta.next_token;
			}
		} else {
			hasNextPage = false;
		}
	}

	// console.log(JSON.stringify(userTweets, undefined, 2))
	// console.log(`Got ${userTweets.length} Tweets from `);
};

// getNextUser();
//
//   I need to search by user id unfortunately. Get that from the request above

// const userId = 2244994945;
// const bearerToken = process.env.BEARER_TOKEN;

// getUserTweets("joe biden");
