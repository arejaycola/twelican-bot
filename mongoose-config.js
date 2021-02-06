const mongoose = require('mongoose');
mongoose.set('useFindAndModify', false);

mongoose.connect(process.env.DB_CONNECTION_URL, {
	useNewUrlParser: true,
	useCreateIndex: true,
	useUnifiedTopology: true,
	dbName: 'Twelican-Bot',
	poolSize: 20,
	socketTimeoutMS: 60000,
});

mongoose.connection.on('open', console.error.bind(console, 'Connect to MongoDB server...'));
mongoose.connection.on('error', console.error.bind(console, 'MongoDB connection error'));

process.on('SIGINT', function () {
	mongoose.connection.close(function () {
		console.log('Mongoose disconnected on app termination');
		process.exit(0);
	});
});

module.exports = {
	mongoose,
};
