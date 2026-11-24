const lines = [
  ['Today, we are exploring inheritance in object-oriented programming.', 'Aujourd’hui, nous explorons l’héritage en programmation orientée objet.', '今天，我们来学习面向对象编程中的继承。'],
  ['Inheritance lets a new class reuse properties and methods from an existing class.', 'L’héritage permet à une nouvelle classe de réutiliser les propriétés et méthodes d’une classe existante.', '继承允许新类复用已有类的属性和方法。'],
  ['We call the existing class the parent, and the new class the child or subclass.', 'La classe existante est appelée classe parente, et la nouvelle classe, classe enfant ou sous-classe.', '已有的类叫作父类，新的类叫作子类。'],
  ['For example, an Animal class can define move and eat methods.', 'Par exemple, une classe Animal peut définir les méthodes move et eat.', '例如，Animal 类可以定义 move 和 eat 方法。'],
  ['A Dog class can inherit these methods and add its own bark method.', 'Une classe Dog peut hériter de ces méthodes et ajouter sa propre méthode bark.', 'Dog 类可以继承这些方法，再添加自己的 bark 方法。'],
  ['A subclass can also override a method to provide more specific behavior.', 'Une sous-classe peut aussi redéfinir une méthode pour fournir un comportement plus spécifique.', '子类也可以重写方法，提供更具体的行为。'],
  ['Use inheritance for an is-a relationship. A dog is an animal.', 'Utilisez l’héritage pour une relation « est un ». Un chien est un animal.', '当两个类是“是一种”的关系时，可以使用继承。狗是一种动物。'],
  ['For review, think about when composition might be a better choice than inheritance.', 'Pour réviser, réfléchissez aux situations où la composition serait préférable à l’héritage.', '复习时，可以想一想：在什么情况下，组合会比继承更合适？'],
];
export const sampleTitle = { en: 'Understanding inheritance', fr: 'Comprendre l’héritage', zh: '理解面向对象编程中的继承' };
export function sampleEntry(index, language = 'en') {
  const translations = Object.fromEntries(['en', 'fr', 'zh'].map((lang, i) => [lang, lines[index][i]]));
  return { id: crypto.randomUUID(), text: translations[language], translations, time: index * 12000 };
}
export const sampleCount = lines.length;
export const sampleNotes = {
  en: '# Understanding inheritance\n\n## Overview\nInheritance lets a class reuse and extend the behavior of another class.\n\n## Key ideas\n- Parent class: supplies shared properties and methods. [00:24]\n- Child class: inherits those features and may add its own. [00:24]\n- Example: Dog inherits move() and eat() from Animal and adds bark(). [00:36–00:48]\n- Overriding replaces an inherited method with more specific behavior. [01:00]\n- Inheritance represents an “is-a” relationship. [01:12]\n\n## Review question\nWhen might composition be a better choice than inheritance? [01:24]\n\nThese are prewritten sample notes, not an AI summary of your edits.',
  fr: '# Comprendre l’héritage\n\n## Vue d’ensemble\nL’héritage permet à une classe de réutiliser et d’étendre le comportement d’une autre.\n\n## Idées clés\n- Classe parente : fournit les propriétés et méthodes communes. [00:24]\n- Sous-classe : hérite de ces éléments et peut en ajouter. [00:24]\n- Exemple : Dog hérite de move() et eat() de Animal et ajoute bark(). [00:36–00:48]\n- Redéfinition : une méthode héritée reçoit un comportement plus spécifique. [01:00]\n- L’héritage représente une relation « est un ». [01:12]\n\n## Question de révision\nQuand la composition serait-elle préférable à l’héritage ? [01:24]\n\nCes notes sont préécrites et ne résument pas vos modifications avec l’IA.',
  zh: '# 理解继承\n\n## 内容概览\n继承让一个类复用并扩展另一个类的行为。\n\n## 重点\n- 父类提供共用的属性和方法。[00:24]\n- 子类继承这些特征，并可以添加自己的功能。[00:24]\n- 例子：Dog 继承 Animal 的 move() 和 eat()，再添加 bark()。[00:36–00:48]\n- 方法重写：用更具体的行为替换继承的方法。[01:00]\n- 继承表达“是一种”的关系。[01:12]\n\n## 复习问题\n什么情况下，组合会比继承更合适？[01:24]\n\n这是一份预设的示例笔记，并不是根据你的修改生成的 AI 总结。',
};
