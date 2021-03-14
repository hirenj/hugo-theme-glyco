let bootstraps = [];

function reserveBootstrapSlot() {
  return new Promise(resolve => {
    bootstraps.push(resolve);
  });
}

function queueBootstrapSlot(func) {
  bootstraps.push(func);
}

function fireBootstraps() {
  console.log('Firing',bootstraps.length);
  for (let func of bootstraps) {
    func.call();
  }
}

reserveBootstrapSlot().then( () => {
  console.log('Post firing of bootstrap slot');
})

export { fireBootstraps, queueBootstrapSlot, reserveBootstrapSlot };