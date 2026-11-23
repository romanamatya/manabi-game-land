export function mockPublicVisibility(page, states = {}) {
  return page.route(/\/public-firebase-session\.js(?:\?|$)/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.ManabiFirebaseSession = { open: async () => {
      const states = ${JSON.stringify(states)};
      const snapshot = (path, fromCache = false) => {
        const state = states[path.split('/').pop()];
        return {
          exists: () => state !== null,
          data: () => ({ status: state ?? 'published' }),
          metadata: { fromCache },
        };
      };
      return { db: {}, F: {
        doc(_db, path) { return path; },
        async getDocFromServer(path) { return snapshot(path); },
        onSnapshot(path, options, receive, reject) {
          if (states[path.split('/').pop()] === 'read-error') reject(new Error('visibility read failed'));
          else receive(snapshot(path));
          return () => {};
        },
      }};
    }};`,
  }));
}
