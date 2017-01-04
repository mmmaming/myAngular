var _ = require('lodash');
module.exports = function sayHello(to) {
	// return 'Hello, Jane!';
	return _.template('Hello, <%= name %>!')({name: to});
};