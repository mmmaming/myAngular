通常启动Angular新手的scope继承的一个方面是属性的阴影。 虽然这是使用JavaScript原型链的直接后果，但值得讨论。
从我们现有的测试用例中可以清楚地看到，当你从scope中读取一个属性时，它会在原型链上查找它，如果它在当前的scope中不存在，则从父scope中查找它。
然后，再次，当你在scope上分配属性时，它仅在该scope及其子项（而不是其父项）上可用。
关键的实现是，当我们在子scope上重用属性名称时，此规则也适用：

```
it('shadows a parents property with the same name', function() {
    var parent = new Scope();
    var child = parent.$new();
    parent.name = 'Joe';
    child.name = 'Jill';
    expect(child.name).toBe('Jill');
    expect(parent.name).toBe('Joe');
});
```

当我们在子scope上分配一个父scope已经存在的属性时，它不会改变父scope，事实上，我们在scope链身上有两个不同的属性，都叫name。这通常被称为阴影。从孩子的角度来看，父scope的name属性被子scope的name属性隐藏了。（父属性被子属性覆盖）。
这是一个常见的混乱来源，当然有真正的用例在父scope上改变状态。 为了解决这个问题，一个常见的模式是将属性包装在对象中。
该对象的内容可以被改变（就像在上一节的数组操作示例中一样）

```

it('does not shadow members of parent scopes attributes', function() {
    var parent = new Scope();
    var child = parent.$new();
    parent.user = {name: 'Joe'};
    child.user.name = 'Jill';
    expect(child.user.name).toBe('Jill');
    expect(parent.user.name).toBe('Jill');
});
```

这样做的原因是我们不在子scope上分配任何内容。 我们只从scope中读取用户属性，并在该对象内分配内容。 两个scope都引用同一个用户对象，这是一个与scope继承无关的纯JavaScript对象。
---
此模式可以重新表述为点规则，指的是在对scope进行更改的表达式中具有的属性访问点的数量。
---