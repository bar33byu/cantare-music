import "@testing-library/jest-dom";

if (typeof HTMLMediaElement !== "undefined") {
  Object.defineProperties(HTMLMediaElement.prototype, {
    load: {
      configurable: true,
      value: function load() {},
    },
    pause: {
      configurable: true,
      value: function pause() {},
    },
  });
}
