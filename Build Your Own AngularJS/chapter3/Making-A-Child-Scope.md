虽然你可以根据需要创建多个 root scopes，但是通常情况下，你会为现有的scope创建子scope（或者让angular为你创建），可以通过在现有的scope上调用`$new`函数来完成。
让我们测试一下$new的实现，在开始之前，首先添加一个新的describe在test/scope_spec.js里，用于测试继承相关的代码，test文件应该具有如下结构。

```
describe('Scope', function() {
    describe('digest', function() {
        // Tests from the previous chapter...
    });
     describe('$watchGroup', function() {
        // Tests from the previous chapter...
    });
    describe('inheritance', function() {
        // Tests for this chapter
    });
});
```

关于子scope的第一件事情是它共享父scope的属性。

```
it('inherits the parent‘s properties', function() {
    var parent = new Scope();
    parent.aValue = [1, 2, 3];

    var child = parent.$new();

    expect(child.aValue).toEqual([1, 2, 3]);
});
```

反之亦然，在子scope上创建属性不会存在于父scope。

```
it('does not cause a parent to inherit its properties', function() {
    var parent = new Scope();
    var child = parent.$new();
    child.aValue = [1, 2, 3];
    expect(parent.aValue).toBeUndefned();
});
```

共享属性与定义属性时无关，当一个属性在父scope上时，所有存在的子scope都有这个属性。

```
it('inherits the parents properties whenever they are defned', function() {
    var parent = new Scope();
    var child = parent.$new();
    parent.aValue = [1, 2, 3];
    expect(child.aValue).toEqual([1, 2, 3]);
});
```

你还可以在子scope上操作父scope的属性，因为两个scope实际上指向的是同一个值。

```
it('can manipulate a parent scopes property', function() {
    var parent = new Scope();
    var child = parent.$new();
    parent.aValue = [1, 2, 3];
    child.aValue.push(4);
    expect(child.aValue).toEqual([1, 2, 3, 4]);
    expect(parent.aValue).toEqual([1, 2, 3, 4]);
});
```

从这点也可以看出来，你可以从子scope上$watch父scope的属性。

```
		it('can watch a property in the parent', function() {
    var parent = new Scope();
    var child = parent.$new();
    parent.aValue = [1, 2, 3];
    child.counter = 0;
    child.$watch(
        function (scope) {
            return scope.aValue;
        },
        function (newValue, oldValue, scope) {
            scope.counter++;
        },
        true
    );
    child.$digest();
    expect(child.counter).toBe(1);
    parent.aValue.push(4);
    child.$digest();
    expect(child.counter).toBe(2);
});
```

---
你可能已经注意到子scope也有$watch函数，我们为Scope.prototype定义。 这通过与用于用户定义的属性完全相同的继承机制发生：由于父scope继承Scope.prototype，子scope继承
父scope，Scope.prototype中定义的每个scope都可用！
---
最后，上面所说的一切都适用于任意深度的scope层级。

```
it('can be nested at any depth', function() {
    var a = new Scope();
    var aa = a.$new();
    var aaa = aa.$new();
    var aab = aa.$new();
    var ab = a.$new();
    var abb = ab.$new();
    a.value = 1;
    expect(aa.value).toBe(1);
    expect(aaa.value).toBe(1);
    expect(aab.value).toBe(1);
    expect(ab.value).toBe(1);
    expect(abb.value).toBe(1);
    ab.anotherValue = 2;
    expect(abb.anotherValue).toBe(2);
    expect(aa.anotherValue).toBeUndefned();
    expect(aaa.anotherValue).toBeUndefned();
});
```

目前我们指定的所有内容，其实现都非常简单，我们只需要研究JavaScript的对象继承原理，因为angular故意模拟了JavaScript本身的工作原理，基本上，当创建子scope时，其父scope会制作它的原型。

让我们在`Scope.prototype`上创建`$new`函数，它在当前scope上创建一个子scope，并返回它。

```

Scope.prototype.$new = function() {
	var ChildScope = function() {};
	ChildScope.prototype = this;
	var child = new ChildScope();
	return child;
};

```

在函数中，首先创建了一个叫ChildScope的构造函数，这个ChildScope不需要做任何事情，所以我们只是让它是一个空函数，然后我们设置Scope为ChildScope的原型（ChildScope.prototype = Scope;），最后使用ChildScope new一个新对象并返回它。
这个短函数足以让我们的测试用例都通过，你还可以使用ES5简写函数`Object.create()`构造子scope。
