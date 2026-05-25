/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
    branches: ["v2", "v3"],
    plugins: [
        "@semantic-release/commit-analyzer",
        "@semantic-release/release-notes-generator",
        ["@semantic-release/npm", {"pkgRoot": "./dist"}],
        "@semantic-release/github"
    ]
};
