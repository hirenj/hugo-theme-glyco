let bootstraps = [];


class TriggerablePromise {
  constructor() {
    this.queue = [];
  }
  trigger() {
    for (let func of this.queue) {
      func.call();
    }
  }
  get promise() {
    let result = new Promise( resolve => {
      this.queue.push(resolve);
    });
    return result;
  }
}

function reserveBootstrapSlot() {
  return new Promise(resolve => {
    bootstraps.push(resolve);
  });
}

function queueBootstrapSlot(func) {
  let trigger = new TriggerablePromise();
  bootstraps.push( () => {
    trigger.trigger();
  });
  return trigger.promise.then(func);
}

async function fireBootstraps() {
  console.log('Firing Boostrapping queue',bootstraps.length);
  for (let func of bootstraps) {
    await Promise.resolve().then(func);
  }
}

export { fireBootstraps, queueBootstrapSlot, reserveBootstrapSlot };