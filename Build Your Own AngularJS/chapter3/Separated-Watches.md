我们已经看到，可以在子scope上添加$watch，因为子scope继承了父scope的所有方法，包括$watch和$digest。但是这些$watch实际储存在哪儿以及他们在哪个scope上执行?

在目前的实现中，所有的$watch事实上存在rootScope上，这是因为我们定义的`$$watchers`数组在Scope上，即rootScope的构造函数上。当任何子scope访问`$$watchers`数组，（或者任何其他在构造函数中初始化过的属性），它会通过原型链获得rootScope的副本。

这有一个重点，无论我们在哪个scope上执行$digest,都会执行scope层级结构上的所有watchers，这是因为只有一个watch数组：在rootScope上的那个。这并不是我们想要的。

我们真正想要的是，当我们调用$digest的时候，只检查当前调用的scope和它的子scope上的watchers。而不是其他scope以及它的父scope。这是目前的情况。

```

it('does not digest its parent(s)', function() {
    var parent = new Scope();
    var child = parent.$new();
    parent.aValue = 'abc';
    parent.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
        scope.aValueWas = newValue;
        }
    );
    child.$digest();
    expect(child.aValueWas).toBeUndefned();
});
```

这个测试会失败，因为当调用`child.$digest()`的时候，实际执行了父scope的watch。接下来解决这个问题，给每个子scope分配自己的`$$watchers`数组。

```

Scope.prototype.$new = function() {
    var ChildScope = function() { };
    ChildScope.prototype = this;
    var child = new ChildScope();
    child.$$watchers = [];
    return child;
};
```

你可能已经注意到，我们在这里做了属性隔离，就像前面讨论的那样。每个scope的$$watchers隔离了父scope的$$watchers，每个层级的scope都有自己的watchers。当我们在scope上调用$digest时，只会精确的执行当前scope的watchers.
