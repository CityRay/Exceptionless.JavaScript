import { DefaultErrorParser } from '../../services/DefaultErrorParser';
import { ExceptionlessClient } from '../../ExceptionlessClient';
import { EventPluginContext } from '../EventPluginContext';
import { EventExclusionPlugin } from './EventExclusionPlugin';
import { expect } from 'chai';
import { IEvent } from '../../models/IEvent';

describe('EventExclusionPlugin', () => {
  describe('should exclude log levels', () => {
    function run(source: string, level: string, settingKey: string, settingValue: string): boolean {
      let client = new ExceptionlessClient('LhhP1C9gijpSKCslHHCvwdSIz298twx271n1l6xw', 'http://localhost:50000');
      if (settingKey) {
        client.config.settings[settingKey] = settingValue;
      }

      let ev: IEvent = { type: 'log', source: source, data: {} };
      if (level) {
        ev.data['@level'] = level;
      }

      let context = new EventPluginContext(client, ev);
      let plugin = new EventExclusionPlugin();
      plugin.run(context);

      return !!context.cancelled;
    }

    it('<null>', () => expect(run(null, null, null, null)).to.be.false);
    it('Test', () => expect(run('Test', null, null, null)).to.be.false);
    it('[Trace] Test', () => expect(run('Test', 'Trace', null, null)).to.be.false);
    it('[Off] Test', () => expect(run('Test', 'Off', null, null)).to.be.true);
    it('[Abc] Test', () => expect(run('Test', 'Abc', null, null)).to.be.false);
    it('[Trace] Test (source min level: Debug)', () => expect(run('Test', 'Trace', '@@log:Test', 'Debug')).to.be.true);
    it('[Info] Test (source min level: Debug)', () => expect(run('Test', 'Info', '@@log:Test', 'Debug')).to.be.false);
    it('[Trace] Test (global min level: Debug)', () => expect(run('Test', 'Trace', '@@log:*', 'Debug')).to.be.true);
    it('[Warn] Test (global min level: Debug)', () => expect(run('Test', 'Warn', '@@log:*', 'Debug')).to.be.false);
  });

  describe('should exclude log levels with info default:', () => {
    function run(source: string, level: string, settingKey: string, settingValue: string): boolean {
      let client = new ExceptionlessClient('LhhP1C9gijpSKCslHHCvwdSIz298twx271n1l6xw', 'http://localhost:50000');
      client.config.settings['@@log:*'] = 'Info';
      if (settingKey) {
        client.config.settings[settingKey] = settingValue;
      }

      let ev: IEvent = { type: 'log', source: source, data: {} };
      if (level) {
        ev.data['@level'] = level;
      }

      let context = new EventPluginContext(client, ev);
      let plugin = new EventExclusionPlugin();
      plugin.run(context);

      return !!context.cancelled;
    }

    it('<null>', () => expect(run(null, null, null, null)).to.be.false);
    it('Test', () => expect(run('Test', null, null, null)).to.be.false);
    it('[Trace] Test', () => expect(run('Test', 'Trace', null, null)).to.be.true);
    it('[Warn] Test', () => expect(run('Test', 'Warn', null, null)).to.be.false);
    it('[Error] Test (source min level: Debug)', () => expect(run('Test', 'Error', '@@log:Test', 'Debug')).to.be.false);
    it('[Debug] Test (source min level: Debug)', () => expect(run('Test', 'Debug', '@@log:Test', 'Debug')).to.be.false);
  });

  describe('should exclude source type', () => {
    function run(type: string, source: string, settingKey: string, settingValue: string|boolean): boolean {
      let client = new ExceptionlessClient('LhhP1C9gijpSKCslHHCvwdSIz298twx271n1l6xw', 'http://localhost:50000');
      if (settingKey) {
        client.config.settings[settingKey] = settingValue;
      }

      let context = new EventPluginContext(client, { type: type, source: source, data: {} });
      let plugin = new EventExclusionPlugin();
      plugin.run(context);

      return !!context.cancelled;
    }

    it('<null>', () => expect(run(null, null, null, null)).to.be.false);
    it('<null>', () => expect(run('feature', null, null, null)).to.be.false);
    it('<null>', () => expect(run('feature', 'test', null, null)).to.be.false);
    it('<null>', () => expect(run('feature', 'test', '@@feature:Test', true)).to.be.false);
    it('<null>', () => expect(run('feature', 'test', '@@feature:Test', false)).to.be.true);
    it('<null>', () => expect(run('feature', 'test', '@@feature:*', false)).to.be.true);
    it('<null>', () => expect(run('404', '/unknown', '@@404:*', false)).to.be.true);
    it('<null>', () => expect(run('404', '/unknown', '@@404:/unknown', false)).to.be.true);
    it('<null>', () => expect(run('404', '/unknown', '@@404:/unknown', true)).to.be.false);
  });

  describe('should exclude exception type:', () => {
    function createException() {
      function throwError() {
        throw new ReferenceError('This is a test');
      }

      try {
        throwError();
      } catch (e) {
        return e;
      }
    }

    function run(settingKey: string): boolean {
      let client = new ExceptionlessClient('LhhP1C9gijpSKCslHHCvwdSIz298twx271n1l6xw', 'http://localhost:50000');
      if (settingKey) {
        client.config.settings[settingKey] = false;
      }

      let errorParser = new DefaultErrorParser();
      let context = new EventPluginContext(client, { type: 'error', data: { } });
      context.event.data['@error'] = errorParser.parse(context, createException());

      let plugin = new EventExclusionPlugin();
      plugin.run(context);

      return !!context.cancelled;
    }

    it('<null>', () => expect(run(null)).to.be.false);
    it('@@error:Error', () => expect(run('@@error:Error')).to.be.false);
    it('@@error:ReferenceError', () => expect(run('@@error:ReferenceError')).to.be.true);
    it('@@error:*Error', () => expect(run('@@error:*Error')).to.be.true);
    it('@@error:*', () => expect(run('@@error:*')).to.be.true);
  });
});
