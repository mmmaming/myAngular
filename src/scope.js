'use strict';
var _ = require('lodash');
function Scope() {
	this.$$watchers = [];
	this.$$lastDirtyWatch = null;
	this.$$asyncQueue = [];
	this.$$applyAsyncQueue = [];
	this.$$applyAsyncId = null;
	this.$$postDigestQueue = [];
	this.$$phase = null;
}

function initWatchVal() {

}
Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
	var self = this;
	var watcher = {
		watchFn: watchFn,
		listenerFn: listenerFn || function() {},
		valueEq: !!valueEq,
		last: initWatchVal
	};
	self.$$watchers.unshift(watcher);
	this.$$lastDirtyWatch = null;

	return function() {
		var index = self.$$watchers.indexOf(watcher);
		if (index >= 0) {
			self.$$watchers.splice(index, 1);
			self.$$lastDirtyWatch = null;
		}
	};
};

Scope.prototype.$$digestOnce = function() {
	var self = this;
	var newValue, oldValue, dirty;
	_.forEachRight(this.$$watchers, function(watcher) {
		try {
            if (watcher) {
            	newValue = watcher.watchFn(self);
	            oldValue = watcher.last;
	            // 判断newValue和oldValue如果不相等（注意引用传递和值传递的区别）
	            if (!self.$$areEqual(newValue, oldValue, watcher.valueEq)) {
	                self.$$lastDirtyWatch = watcher;
	                watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue);
	                watcher.listenerFn(newValue,
	                    (oldValue === initWatchVal ? newValue : oldValue),
	                    self);
	                dirty = true;
	            } else if(self.$$lastDirtyWatch === watcher) {
	                return false;
	            }
            }
        } catch (e) {
            console.log(e);
        }
	});
	return dirty;
};

Scope.prototype.$digest = function() {
	// time to live 
	var ttl = 10;
	var dirty;
	this.$$lastDirtyWatch = null;
	this.$beginPhase('$digest');

	if (this.$$applyAsyncId) {
		clearTimeout(this.$$applyAsyncId);
		this.$$flushApplyAsync();
	}
	do {
		while (this.$$asyncQueue.length) {
			var asyncTask = this.$$asyncQueue.shift();
			asyncTask.scope.$eval(asyncTask.expression);
		}
		dirty = this.$$digestOnce();
		// 如果是脏值或者$$asyncQueue中还有值
		if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
			this.$clearPhase();
			throw '10 digest iterations reached';
		}
	} while (dirty || this.$$asyncQueue.length);
	this.$clearPhase();

	while (this.$$postDigestQueue.length) {
		this.$$postDigestQueue.shift()();
	}
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
	if(valueEq) {
		return _.isEqual(newValue, oldValue);
	} else {
		return newValue === oldValue ||
            (typeof newValue === 'number' && typeof oldValue === 'number' &&
            isNaN(newValue) && isNaN(oldValue));
	}
};

Scope.prototype.$eval = function(expr, locals) {
	return expr(this, locals);
};

Scope.prototype.$apply = function(expr) {
	try{
		this.$beginPhase('$apply');
		return this.$eval(expr);
	} finally {
		this.$clearPhase();
		this.$digest();
	}
};

// 确保$evalAsync执行的时候，总是在稍后触发一个$digest脏检查.
Scope.prototype.$evalAsync = function(expr) {
	var self = this;
	// 如果是当前scope上的phase不存在或者$$asyncQueue异步队列中已经没有值了,是空的
	if (!self.$$phase && !self.$$asyncQueue.length) {
		setTimeout(function() {
			if (self.$$asyncQueue.length) {
				self.$digest();
			}
		}, 0);
	}
	self.$$asyncQueue.push({scope: self, expression: expr});
};

Scope.prototype.$beginPhase = function(phase) {
	if (this.$$phase) {
		throw this.$$phase + ' already in progress.';
	}
	this.$$phase = phase;
};

Scope.prototype.$clearPhase = function() {
	this.$$phase = null;
};

Scope.prototype.$applyAsync = function(expr) {
	var self = this;
	self.$$applyAsyncQueue.push(function() {
		self.$eval(expr);
	});
	if (self.$$applyAsyncId === null) {
		self.$$applyAsyncId = setTimeout(function() {
			// self.$apply(function() {
			// 	while (self.$$applyAsyncQueue.length) {
			// 		// 执行applyAsyncQueue队列中的第一个函数并在数组里删除它
			// 		self.$$applyAsyncQueue.shift()();
			//
			// 	}
			// 	self.$$applyAsyncId = null;
			// });
			self.$apply(_.bind(self.$$flushApplyAsync, self));
		}, 0);
	}
};

Scope.prototype.$$flushApplyAsync = function() {
	while (this.$$applyAsyncQueue.length) {
		// 执行applyAsyncQueue队列中的第一个函数并在数组里删除它
		this.$$applyAsyncQueue.shift()();
	}
	this.$$applyAsyncId = null;
};

Scope.prototype.$$postDigest = function(fn) {
	this.$$postDigestQueue.push(fn);
};


module.exports = Scope;