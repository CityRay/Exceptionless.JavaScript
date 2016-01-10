import { expect } from 'chai';
import { Tree } from './Tree';

import { DefaultErrorParser } from './services/DefaultErrorParser';

class TestPlugin {

  private errorParser;

  constructor(errorParser) {
    this.errorParser = errorParser;
  }

  public getErrorParser() {
    return this.errorParser;
  }
}

describe('Tree', () => {

  let tree: Tree;

  beforeEach(() => {
    tree = new Tree();
  });

  describe('when injecting into TestPlugin', () => {

    let plugin1: TestPlugin;
    let plugin2: TestPlugin;

    beforeEach(() => {
      tree.register('errorPlugin', TestPlugin);
      tree.singleton('errorParser', DefaultErrorParser);
      plugin1 = tree.resolve('errorPlugin');
      plugin2 = tree.resolve('errorPlugin');
    });

    it('should return different plugin instances', () => {
      expect(plugin1).not.to.equal(plugin2);
    });

    it('should inject same parser instance', () => {
      let parser1 = plugin1.getErrorParser();
      let parser2 = plugin2.getErrorParser();
      expect(parser1).to.equal(parser2);
    })

  });
});
