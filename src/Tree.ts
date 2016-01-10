/**************************************************************/
/* Ported to TypeScript from https://github.com/autoric/nject */
/**************************************************************/

let LOG_LEVEL = {
  DEBUG: 'debug',
  WARN: 'warn'
};

function isUndefined(value) {
  return typeof value === 'undefined';
}

function countBy(collection) {
  let result = {};

  collection.forEach((value) => {
    let key = String(value);
    result.hasOwnProperty(key) ? result[key]++ : result[key] = 1;
  });
  return result;
}

function contains(collection, target) {
  for (let key in collection) {
    if (collection[key] === target) {
      return true;
    }
  }

  return false;
}

function interpolate(str: string, args) {
  return str.replace(/\{([^{}]*)\}/g,
    (a, b) => {
      let r = args[b];
      return (typeof r === 'string' || typeof r === 'number')
        ? r.toString()
        : JSON.stringify(r);
    });
};

function clone(value) {
  value = value || {};
  let cloned: any = {};
  for (let k in value || {}) {
    if (value.hasOwnProperty(k)) {
      cloned[k] = value[k];
    }
  }

  return cloned;
}

function buildPathErrorMsg(msg, path) {
  msg = msg || '';
  msg += '\n    ';

  path.forEach((item, index) => {
    if (index !== 0) {
      msg += ' -> ';
    }
    msg += item;
  });

  return msg;
}

export class Tree {

  private _registry = {};
  private _resolved = {};

  /**
   * Registers a constant or constants with the given @key name.  If the @key
   * is a plain object it will be iterated over, using the key value pairs
   * for registration.
   *
   * A constant will not be resolved, and will be injected into
   * factories as-is.
   *
   * This function just passes through to register with the `constant` option set to true
   *
   * @param key {String|Object} -
   *  Name of dependency or an object containing key/value pairs to be registered.
   *
   * @param value {*} -
   *  The constant to register.
   *
   * @param opts {Object} optional -
   *  Options hash, passed to `register` function.
   *
   * @returns {*} -
   *  This tree, allowing the further chaining.
   */
  public constant(key, value, opts?) {
    var clonedOpts = clone(opts);
    clonedOpts.constant = true;

    this.register(key, value, clonedOpts);
  }

  public singleton(key, value, opts?) {
    var clonedOpts = clone(opts);
    clonedOpts.singleton = true;

    this.register(key, value, clonedOpts);
  }

  /**
   * Registers a dependency or dependencies with the given @key name. If the @key
   * is a plain object it will be iterated over, using the key value pairs
   * for registration.
   *
   * Unless specified as a constant in the opts, the registered dependency is assumed
   * to be a factory - a function whose arguments (variable names) declare its
   * dependencies. At time of resolution, the factory function will be invoked
   * with its dependencies.
   *
   * @param key {String|Object} -
   *  Name of dependency or an object containing key/value pairs to be registered.
   *
   * @param value {*|Function} -
   *  The dependency to register.
   *
   * @param opts {Object} optional -
   *  opts.aggregateOn {String|Array[String]} -
   *    Registers one or more aggregation objects on the tree. Aggregation objects
   *    are injectable dependencies whose key / value pairs are a roll-up of all
   *    dependencies that aggregate onto them.
   *  opts.constant {Boolean} -
   *    Indicates where the dependency should be registered as a constant or a
   *    factory function.
   *
   * @returns {*} -
   *  This tree, allowing the further chaining.
   */
  public register(key, value, opts?) {
    let msg = null,
      registry = this._registry,
      dependencies = [];

    // If key is an object, iterate over the key value pairs and register each
    if (typeof key === 'object') {
      // If the user is registering using object notation, value argument is optional
      if (isUndefined(opts)) {
        opts = value;
      }
      for (let k in key) {
        if (key.hasOwnProperty(k)) {
          let v = key[k];
          this.register(k, v, opts);
        }
      }

      return this;
    }

    // Normalize options
    opts = opts || {};
    if (toString.call(opts) !== '[object Object]') {
      throw new Error('Registration options must be a plain object');
    }
    let aggregateOn = opts.aggregateOn,
      constant = opts.constant || false,
      singleton = opts.singleton || false;

    this._log(LOG_LEVEL.DEBUG, 'Registering {0} as {1}', key, (constant ? 'constant' : 'factory'));

    // Allow for overriding of registered dependencies
    if (this.isRegistered(key)) {
      msg =
        'Naming conflict encountered on {0} \n' +
        'Overwriting registered dependency with new definition.';
      this._log(LOG_LEVEL.WARN, msg, key);
      this.destroy(key);
    }

    // If we are not registering a constant, check that the factory is a function
    // and get its dependencies
    if (!constant) {
      if (typeof value !== 'function') {
        throw new Error('Cannot register non-function as factory: ' + key);
      }
      dependencies = this._findDependencies(value);
    }

    // Add new dependency to the registry
    registry[key] = {
      dependencies: dependencies,
      isConstant: constant,
      isSingleton: singleton,
      value: value
    };

    // Deal with aggregators if they are defined
    if (aggregateOn) {
      // Normalize to an array
      if (!Array.isArray(aggregateOn)) {
        aggregateOn = [aggregateOn];
      }

      aggregateOn.forEach(aggregateOn, aggregateKey => {
        let aggregator = registry[aggregateKey];
        if (isUndefined(aggregator)) {
          // An aggregator is a special factory which returns a roll-up of its aggregated
          // dependencies as an object
          let aggregateFn = function() {
            let ret = {};
            Array.prototype.slice.call(arguments).forEach((injected, i) => {
              let k = registry[aggregateKey].dependencies[i];
              ret[k] = injected;
            });

            return ret;
          };

          // Register the aggregator on the tree
          this.register(aggregateKey, aggregateFn);
          aggregator = registry[aggregateKey];
        }

        // Manually manage the dependencies of the aggregator
        aggregator.dependencies.push(key);
      });
    }

    return this;
  }

  /**
   * Determines if the given key is registered.
   *
   * @param key {String} -
   *  Name of a registered injectable.
   *
   * @returns {boolean} -
   *  True if the key has been registered.
   */
  public isRegistered(key) {
    return !!this._registry[key];
  }

  /**
   * Resolves one or more dependencies on the the tree. If a key is provided, the method will
   * return the resolved value of the dependency. If no key is provided, it will resolve
   * all dependencies on the tree, and return an object whose key value pairs are each
   * registered dependency and its resolved value.
   *
   * @param key {String} optional -
   *  The name of the dependency to resolve. If not provided, all dependencies on the tree
   *  will be resolved.
   *
   * @returns {*} -
   *  The resolved value or values.
   */
  public resolve(key) {
    if (isUndefined(key)) {
      this._log(LOG_LEVEL.DEBUG, 'Beginning resolution for all dependencies');
      let o = {};
      Object.keys(this._registry).forEach(k => {
        o[k] = this._resolve(k);
      });
      return o;
    } else {
      this._log(LOG_LEVEL.DEBUG, 'Beginning resolution for {0}', key);
      return this._resolve(key);
    }
  }

  /**
   *
   * Clears the resolved state of one or more dependencies on the tree. If the dependency has been resolved,
   * its resolved value is cleared from the cache and the destroy event is triggered on its context. When
   * a dependency is destroyed, anything that depended upon it will also be destroyed.
   *
   * @param key {String} optional -
   *  The registration key of the dependency. If not provided, all registered dependencies on the tree
   *  are destroyed.
   */
  public destroy(key) {
    let keys = Object.keys(this._registry);

    if (key) {
      this._log(LOG_LEVEL.DEBUG, 'Beginning destroy for {0}', key);
      this._destroy(key);
    } else {
      this._log(LOG_LEVEL.DEBUG, 'Destroying tree');
      keys.forEach(k => {
        this._destroy(k);
      });
    }
  }

  /*
   * Emits log events for debugging or warning information
   */
  private _log(level, ...msg) {
    if (!contains(LOG_LEVEL, level)) {
      throw new Error('Cannot log on unknown level: ' + level);
    }

    let message = msg[0];

    if (msg.length > 1) {
      message = interpolate(message, msg.slice(1));
    }

    // this._emit(level, msg);
  }

  /*
   * Extracts dependencies of a function from the variable names
   * of the function parameters using function.toString().
   *
   * This is a copy / paste from angular.
   */
  private _findDependencies(fn) {
    let ARROW_ARG = /^([^\(]+?)=>/;
    let FN_ARGS = /^[^\(]*\(\s*([^\)]*)\)/m;
    let FN_ARG_SPLIT = /,/;
    let STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

    let fnText = fn.toString().replace(STRIP_COMMENTS, '');
    let argDecl = fnText.match(ARROW_ARG) || fnText.match(FN_ARGS);
    let dependencies = argDecl[1].split(FN_ARG_SPLIT);

    return dependencies.map(d => d.trim()).filter(d => !!d);
  }

  /*
   * Does the heavy lifting of resolving dependencies
   */
  private _resolve(key, path?) {
    let config = this._registry[key],
      p = path && path.slice(0) || [];

    p.push(key);

    if (isUndefined(config)) {
      let msg = buildPathErrorMsg('Detected unregistered dependency `' + key + '`', p);
      throw new Error(msg);
    }

    if (countBy(p)[key] > 1) {
      let msg = buildPathErrorMsg('Circular dependency detected! Please check the following dependencies to correct the problem', p);
      throw new Error(msg);
    }

    let value = config.value,
      isConstant = config.isConstant,
      isSingleton = config.isSingleton,
      dependencies = config.dependencies,
      resolvedDeps = [],
      resolvedValue,
      context = {};

    this._log(LOG_LEVEL.DEBUG, 'Resolving {0}', key);

    if (!this._resolved.hasOwnProperty(key)) {
      if (isConstant) {
        this._log(LOG_LEVEL.DEBUG, ' - {0} resolved as constant, result is cached', key);
        resolvedValue = value;
      } else {
        this._log(LOG_LEVEL.DEBUG, ' - {0} depends on {1}', key, dependencies);

        // recursively get resolved dependencies
        dependencies.forEach(dependency => {
          resolvedDeps.push(this._resolve(dependency, p));
        });

        this._log(LOG_LEVEL.DEBUG, ' - {0} factory function being invoked with dependencies {1}', key, dependencies);

        // extend the context with the prototype of the factory function (support classes as factories)
        context = Object.create(value.prototype || {});
        resolvedValue = value.apply(context, resolvedDeps);

        // if the factory function does not return a value, set the value to the context object
        // (supports classes as factories)
        if (isUndefined(resolvedValue)) {
          this._log(LOG_LEVEL.DEBUG, ' - {0} returns undefined, treating context as resolved value', key);
          resolvedValue = context;
        }

        this._log(LOG_LEVEL.DEBUG, ' - {0} resolved as factory, result is cached', key);
      }

      if (!isSingleton) {
        return resolvedValue;
      }

      this._resolved[key] = {
        context: context,
        value: resolvedValue
      };

    } else {
      this._log(LOG_LEVEL.DEBUG, ' - {0} has already been resolved, retrieving from cache', key);
    }

    return this._resolved[key].value;
  }

  /*
   * Does the heavy lifting of destroying the provided dependency and anything that has that dependency
   * on its resolution path.
   */
  private _destroy(key) {
    let resolved = this._resolved[key],
      dependsOnKey = [];

    if (!resolved) {
      this._log(LOG_LEVEL.DEBUG, '{0} is not in resolved cache and does not need to be destroyed', key);
      return;
    } else {
      dependsOnKey = Object.keys(this._registry)
        .map(depName => {
          let config = this._registry[depName];
          if (contains(config.dependencies, key)) {
            return depName;
          } else {
            return null;
          }
        })
        .filter(depName => !!depName);

      this._log(LOG_LEVEL.DEBUG, '{0} depends on {1} and must be destroyed.', dependsOnKey, key);
      dependsOnKey.forEach(depName => {
        this._destroy(depName);
      });

      let context = resolved.context;
      this._log(LOG_LEVEL.DEBUG, 'Destroying {0} and clearing from resolved cache', key);
      context.emit('destroy');
      context.removeAllListeners('destroy');
      delete this._resolved[key];
    }
  }
}

