我们已经看到当引入原型继承的时候，父scope和子scope的关系是非常亲密的。父scope的任何属性子scope都可以访问。如果父scope的属性刚好是数组或者对象，那么子scope上也可以改变它的内容。

有时候我们不想这么亲密，子scope作为层级结构scope中的一部分，但不允许访问其父scope的所有内容，这就是隔离scope。

隔离scope的想法很简单：我们让scope是scope层级结构中的一部分，就像我们之前看到的那样，但是却不让它的原型继承自父scope。这相当于切断父scope的原型链。

隔离scope可以通过给$new函数传一个布尔值来创建。当它是true的时候，是隔离scope。当它是false（或者省略/undefined），将使用原型继承。当它是隔离scope时，不能访问父scope的属性。

```
it('does not have access to parent attributes when isolated', function() {
    var parent = new Scope();
    var child = parent.$new(true);
    parent.aValue = 'abc';
    expect(child.aValue).toBeUndefned();
});
```

因为不能访问父scope属性，所以也不能watch它们。

```
it('cannot watch parent attributes when isolated', function() {
    var parent = new Scope();
    var child = parent.$new(true);
    parent.aValue = 'abc';
    child.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
            scope.aValueWas = newValue;
        }
    );
    child.$digest();
    expect(child.aValueWas).toBeUndefned();
});
```

隔离作用域在$new函数中设置。基于给定的布尔值参数，决定创建的子scope是和目前一样还是使用Scope构造函数创建一个独立scope。在这两种情况下，新scope都会添加到当前scope的子集。

```
Scope.prototype.$new = function(isolated) {
	var child;
	if (isolated) {
		child = new Scope();
	} else {
		var ChildScope = function() { };
		ChildScope.prototype = this;
		child = new ChildScope();
	}

	this.$$children.push(child);
	child.$$watchers = [];
	child.$$children = [];
	return child;
};
```
---
如果你是用过Angular指定中的隔离scope，你就会知道隔离scope通常不会与它的父scope完全隔离，你可以显示地在父 Scope 上定义一个 Map 去从父 Scope 上获取对应的属性.

但是此机制并没有内置到scope中，它是指令的一部分。当我们实在指定中的link时，再回过头讨论。
-------------------------------------------------


如果你使用带有Angular伪指令的独立作用域，你会知道一个孤立的作用域通常不会完全切断它的父类。 相反，您可以显式定义范围将从其父级获取的属性的映射。


但是，此机制未内置到范围中。 它是指令实施的一部分。 当我们实现指令范围链接时，我们将回到这个讨论。


由于我们已经破坏了原型继承链，我们需要重新访问本章前面的关于$digest，$apply，$evalAsync和$applyAsync的讨论。

首先，我们希望$digest沿着继承层级结构走，这个我们已经在处理，因为我们已经在它的父scope的$$children中包含了隔离scope。所以下面的测试也会通过。

```
it('digests its isolated children', function() {
    var parent = new Scope();
    var child = parent.$new(true);
    child.aValue = 'abc';
    child.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
            scope.aValueWas = newValue;
        }
    );
    parent.$digest();
    expect(child.aValueWas).toBe('abc');
});
```

这种情况下, $apply, $evalAsync 和 $applyAsync 就没有这么幸运了, 我们希望这些操作都是从rootScope上开始digest, 但是在中间层级的隔离scope会破坏这种设定. 正如下面的两个失败的测试用例:

```
it('digests from root on $apply when isolated', function() {
    var parent = new Scope();
    var child = parent.$new(true);
    var child2 = child.$new();
    parent.aValue = 'abc';
    parent.counter = 0;
    parent.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
            scope.counter++;
        }
    );
    child2.$apply(function(scope) { });
    expect(parent.counter).toBe(1);
});

it('schedules a digest from root on $evalAsync when isolated', function(done) {
    var parent = new Scope();
    var child = parent.$new(true);
    var child2 = child.$new();
    parent.aValue = 'abc';
    parent.counter = 0;
    parent.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
            scope.counter++;
        }
    );
    child2.$evalAsync(function(scope) { });
    setTimeout(function() {
        expect(parent.counter).toBe(1);
        done();
    }, 50);
});
```

---
    由于$applyAsync是根据$apply实现的，也会有同样的问题，所以在$aaply修复时一并修复。
---

注意，这些和我们之前讨论$apply和$evalAsync时写的一样的测试用例，只有这种情况下，我们让scope中的一个隔离。

两个测试用例失败的原因是我们依赖$root属性指向rootScope，非隔离scope可以从原型链上继承而来。但是隔离scope却没有。事实上。由于我们使用Scope的构造函数去创建一个隔离scope，并且构造函数分配了$root，每个隔离scope都有一个$root属性指向它自己，这并不是我们想要的。

修复也很简单，我们需要做的就是修改$new，重新分配$root给rootScope。

```
Scope.prototype.$new = function(isolated) {
	var child;
	if (isolated) {
		child = new Scope();
		child.$root = this.$root;
	} else {
		var ChildScope = function() { };
		ChildScope.prototype = this;
		child = new ChildScope();
	}

	this.$$children.push(child);
	child.$$watchers = [];
	child.$$children = [];
	return child;
};
```

在我们了解继承的所有内容之前，还有一件事需要在隔离scope中修复，这就是在$evalAsync, $applyAsync 和 $$postDigest中使用的队列。对于它们, 我们并未做在子 Scope 或父 Scope 上任何额外的工作, 仅仅简单作为整个 Scope 层级上的任务队列而已.

对于非隔离 Scope: 无论在任何 Scope 上访问这个队列中一个, 我们访问的都是相同队列, 因为每个 Scope 都通过原型链继承了这些队列. 然而对这些隔离 Scope. 就如同之前的 $root 属性, $$asyncQueue, $$applyAsyncQueue 和 $$postDigestQueue 都被 Scope 构造器创建了, 只是都指向了它们自己.

```
it('executes $evalAsync functions on isolated scopes', function(done) {
    var parent = new Scope();
    var child = parent.$new(true);
    child.$evalAsync(function(scope) {
        scope.didEvalAsync = true;
    });
    setTimeout(function() {
        expect(child.didEvalAsync).toBe(true);
        done();
    }, 50);
});

it('executes $$postDigest functions on isolated scopes', function() {
    var parent = new Scope();
    var child = parent.$new(true);
    child.$$postDigest(function() {
        child.didPostDigest = true;
    });
    parent.$digest();
    expect(child.didPostDigest).toBe(true);
});
```

就和 $root 属性一样, 我们希望整个 Scope 层级中每个 Scope 都分享相同的队列, 不管它们是否是隔离 Scope. 如果 Scope 不是隔离的, 我们自动获得对应的队列, 如果是隔离的, 我们需要显示的赋值:

```
Scope.prototype.$new = function(isolated) {
	var child;
	if (isolated) {
		child = new Scope();
		child.$root = this.$root;
		child.$$asyncQueue = this.$$asyncQueue;
		child.$$postDigestQueue = this.$$postDigestQueue;
	} else {
		var ChildScope = function() { };
		ChildScope.prototype = this;
		child = new ChildScope();
	}

	this.$$children.push(child);
	child.$$watchers = [];
	child.$$children = [];
	return child;
};
```

对于 $$applyAsyncQueue, 问题有些不太一样: 因为清理队列是被 $$applyAsyncId 属性控制的, 并且现在整个 Scope 层级中的每个 Scope 可能会有这个属性的实例, 整个 $applyAsync 的目的, 就是合并 $apply 的调用.

如果我们调用子 Scope 上 $digest 方法, 父 Scope 上 $applyAsync 注册的函数应当被清理出队列并被执行. 但是当前的实现不能是下面的测试通过:

```
it("executes $applyAsync functions on isolated scopes", function() {
    var parent = new Scope();
    var child = parent.$new(true);
    var applied = false;
    parent.$applyAsync(function() {
        applied = true;
    });
    child.$digest();
    expect(applied).toBe(true);
});
```

首先, 我们应当在 scope 之间共享队列, 就像 $evalAsync 和 $postDigest 队列做的一样.

```
Scope.prototype.$new = function(isolated) {
	var child;
	if (isolated) {
		child = new Scope();
		child.$root = this.$root;
		child.$$asyncQueue = this.$$asyncQueue;
		child.$$postDigestQueue = this.$$postDigestQueue;
		child.$$applyAsyncQueue = this.$$applyAsyncQueue;
	} else {
		var ChildScope = function() { };
		ChildScope.prototype = this;
		child = new ChildScope();
	}

	this.$$children.push(child);
	child.$$watchers = [];
	child.$$children = [];
	return child;
};
```

第二, 我们需要共享 $$applyAsyncId 属性, 我们不能简单的在 $new 中那样处理, 因为我们需要对它赋值(它是一个基本类型), 所以必须显示的通过 $root 访问就好了.

```
Scope.prototype.$digest = function() {
	// time to live
	var ttl = 10;
	var dirty;
	this.$root.$$lastDirtyWatch = null;
	this.$beginPhase('$digest');

	if (this.$root.$$applyAsyncId) {
		clearTimeout(this.$root.$$applyAsyncId);
		this.$$flushApplyAsync();
	}
	do {
		while (this.$$asyncQueue.length) {
			try {
				var asyncTask = this.$$asyncQueue.shift();
				asyncTask.scope.$eval(asyncTask.expression);
			} catch (e) {
				console.error(e);
			}
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
		try {
			this.$$postDigestQueue.shift()();
		} catch (e) {
			console.error(e);
		}
	}
};

Scope.prototype.$applyAsync = function(expr) {
	var self = this;
	self.$$applyAsyncQueue.push(function() {
		self.$eval(expr);
	});
	if (self.$root.$$applyAsyncId === null) {
		self.$root.$$applyAsyncId = setTimeout(function() {
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
		try {
			this.$$applyAsyncQueue.shift()();
		} catch (e) {
			console.error(e);
		}
	}
	this.$root.$$applyAsyncId = null;
};
```

最后，一切搞定。