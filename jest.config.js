module.exports = {
  preset: "ts-jest",
  rootDir: "src",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/lib/"],
  globals: {
    "ts-jest": {
      packageJson: "package.json"
    }
  }
};
