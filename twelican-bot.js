require('dotenv').config();
const Twitter = require('twitter');
const fs = require('fs');
const Mongoose = require('./mongoose-config').mongoose;
const needle = require('needle');

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

let tweetsCursor;

/* Create an array to try and avoid duplicate requests */
let seenPeople = [];

// const statsTimer = setInterval(async () => {
// 	try {
// 		let person;

// 		if (newFlag) {
// 			total = people.length;
// 			person = people[row];
// 		} else {
// 			total = await TwitterUser.estimatedDocumentCount();
// 			person = cursor && (await cursor.next());
// 		}

// 		/* If the cursor exists get the next person, else get a new cursor */
// 		if (person) {
// 			await updateNextUserStats(person);
// 		} else {
// 			/* Start the list over */
// 			console.log('Acquiring cursor...');
// 			currentCount = 0;
// 			seenPeople = [];
// 			if (newFlag) {
// 				row = 0;
// 			} else {
// 				cursor = await TwitterUser.find({}, '_id id_str name screen_name').cursor();
// 			}
// 		}
// 	} catch (e) {
// 		console.log('Person -----' + person);
// 		console.log(`Cursor error... ${e.stack}`);
// 		console.log('Attempting to get skip cursor...');
// 		console.log(`Skipping ${currentCount}. `);
// 		cursor = await TwitterUser.find({}, '_id id_str name screen_name').skip(currentCount).cursor();
// 	}
// }, 4000); //3000 is the min to not exceed the rate limit

const updateUserTweets = async () => {
	/* Start the list over */
	console.log('Acquiring tweets cursor...');
	tweetsCursor = await TwitterUser.find({}, 'id_str').cursor();

	while ((userId = await tweetsCursor.next())) {
		await getUserTweets(userId.get('id_str'));
		// break;
	}
};
updateUserTweets();

const updateNextUserStats = async (person) => {
	if (person) {
		try {
			let response;

			/* Query Twitter API for user stats. */
			if (newFlag) {
				response = await queryUserInfo(person);
			} else {
				response = await queryUserInfo(person.get('name'));
			}

			/* Loop through responses and update or insert if it is a name we haven't seen before. */
			response.map(async (user) => {
				if (seenPeople.indexOf(user.name) === -1) {
					currentCount++;

					console.log(`Querying ${user.name}...  ${currentCount} of ${total} (${((currentCount / total) * 100).toFixed(2)}%) complete.`);

					/* Update or add a new user to the database. */
					await TwitterUser.findOneAndUpdate({ id_str: user.id_str }, { ...user, last_updated: new Date() }, { upsert: true });

					/* Keep track of duplicate search results to make API calls more efficient */
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

/* Returns a list of n possible matches to query */
const queryUserInfo = async (person, n) => {
	try {
		const response = await client.get(`https://api.twitter.com/1.1/users/search.json`, {
			q: `${person}`,
			count: n,
			include_entities: false,
		});

		/* Filter out any unverified results */
		return response.filter((user) => user.verified);
	} catch (e) {
		console.log(`Error performing user search for ${person.name} at ${currentCount}. `);
		console.log(e);
	}
};

const getPage = async (url, params, options, nextToken) => {
	if (nextToken) {
		params.next_token = nextToken;
	}
// https://developer.twitter.com/en/docs/twitter-api/tweets/timelines/quick-start
	try {
		const resp = await needle('get', url, params, options);
		console.log(JSON.stringify(resp.body, undefined, 2));
		if (resp.statusCode != 200) {
			console.log(`${resp.statusCode} ${resp.statusMessage}:\n${resp.body}`);
			return;
		}
		return resp.body;
	} catch (err) {
		throw new Error(`Request failed: ${err}`);
	}
};

const getUserTweets = async (id) => {
	const url = `https://api.twitter.com/2/users/${id}/tweets`;
	// console.log(id);

	// const url = `https://api.twitter.com/2/tweets?ids=`;

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
	// console.log(`Retrieving Tweets for ${id}`);
	try {
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
	} catch (e) {
		console.log(e);
	}
	
	console.log(userTweets.length)
	// console.log(JSON.stringify(userTweets, undefined, 2))
	// console.log(`Got ${userTweets.length} Tweets from `);
};

// getNextUser();
//
//   I need to search by user id unfortunately. Get that from the request above

// const userId = 2244994945;
// const bearerToken = process.env.BEARER_TOKEN;

// getUserTweets("joe biden");
