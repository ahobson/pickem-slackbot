import { URL } from "url";

export interface PickemConfig {
  stateUrl: URL;
  slackApiToken: string;
  slackSigningSecret: string;
}

function stateUrl(): Promise<URL> {
  return new Promise<URL>((resolve, reject) => {
    if (process.env.STATE_URL) {
      const url = new URL(process.env.STATE_URL);
      return resolve(url);
    } else {
      return reject("STATE_URL is not defined");
    }
  });
}
function signingSecret(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (process.env.SLACK_SIGNING_SECRET) {
      return resolve(process.env.SLACK_SIGNING_SECRET);
    } else {
      return reject("SLACK_SIGNING_SECRET is not defined");
    }
  });
}

function apiToken(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (process.env.SLACK_API_TOKEN) {
      return resolve(process.env.SLACK_API_TOKEN);
    } else {
      return reject("SLACK_API_TOKEN is not defined");
    }
  });
}

export async function loadConfig(): Promise<PickemConfig> {
  return Promise.all([stateUrl(), signingSecret(), apiToken()]).then(
    ([stateUrl, signingSecret, apiToken]) => {
      return {
        stateUrl: stateUrl,
        slackSigningSecret: signingSecret,
        slackApiToken: apiToken
      };
    }
  );
}
