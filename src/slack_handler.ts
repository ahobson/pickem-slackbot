import { Context, Callback } from "aws-lambda";
import { verifyRequestSignature } from "@slack/events-api";
import * as web from "@slack/web-api";
import * as qs from "qs";

import { loadConfig, PickemConfig } from "./config";
import { pickemRepository } from "./models/pickem";
import {
  ObjectStreamConnector,
  URLObjectStreamConnector
} from "./connectors/object_stream_connector";

type StringMap = { [key: string]: string };

type SlashEvent = {
  headers: StringMap;
  body: string;
};

// function botName(): string {
//   return process.env.BOT_NAME || "Pickem Bot";
// }

function sendResponse(
  webClient: web.WebClient,
  channelId: string,
  text: string
) {
  const responseData: web.ChatPostMessageArguments = {
    channel: channelId,
    text: text
  };
  webClient.chat.postMessage(responseData);
}

interface ConversationMembersResult extends web.WebAPICallResult {
  members: string[];
}

function extractSlackUserId(text: string): string | undefined {
  if (text[0] === "<") {
    // usernames look like <@abc123|username>
    return text
      .slice(1)
      .split("|")[0]
      .slice(1);
  } else {
    return undefined;
  }
}

type CommandRequest = {
  slackCommand: string;
  userName: string;
  channelId: string;
  commandText: string;
  commandArgs: string[];
  config: PickemConfig;
  connector: ObjectStreamConnector;
};

async function pickCommand(req: CommandRequest): Promise<string | undefined> {
  const webClient = new web.WebClient(req.config.slackApiToken);
  const convoMembers = (await webClient.conversations.members({
    channel: req.channelId,
    limit: 200
  })) as ConversationMembersResult;

  return pickemRepository
    .pick(req.connector, req.channelId, convoMembers.members)
    .then(userId => {
      if (userId === undefined) {
        return "No users to pick.  Are they all excluded?";
      }
      // let the channel know a user was picked
      sendResponse(
        webClient,
        req.channelId,
        `${req.userName} picked <@${userId}>`
      );
      return undefined; // no additional messages
    })
    .catch(err => {
      console.error(`Error in pick`, err);
      return "Error";
    });
}

async function excludeCommand(
  req: CommandRequest
): Promise<string | undefined> {
  switch (req.commandArgs.length) {
    case 1:
      return pickemRepository
        .excluded(req.connector, req.channelId)
        .then(userIds => {
          if (userIds.length === 0) {
            return "No excluded users";
          }
          const userList = userIds.map(uid => `<@${uid}>`).join(", ");
          return `Excluded users: ${userList}`;
        });
    case 2:
      const userId = extractSlackUserId(req.commandArgs[1]);
      if (userId === undefined) {
        return `Unknown user: ${req.commandArgs[1]}`;
      }
      pickemRepository.exclude(req.connector, req.channelId, userId);
      const webClient = new web.WebClient(req.config.slackApiToken);
      // let the channel know a user was excluded
      sendResponse(
        webClient,
        req.channelId,
        `${req.userName} excluded <@${userId}>`
      );
      return undefined; // no additional messages
    default:
      return (
        "Try 'exclude' to see current excluded users\n" +
        "or try exclude @username"
      );
  }
}

async function includeCommand(
  req: CommandRequest
): Promise<string | undefined> {
  if (req.commandArgs.length != 2) {
    return "Try include @username";
  }
  const userId = extractSlackUserId(req.commandArgs[1]);
  if (userId === undefined) {
    return `Unknown user: ${req.commandArgs[1]}`;
  }
  pickemRepository.include(req.connector, req.channelId, userId);
  const webClient = new web.WebClient(req.config.slackApiToken);
  // let the channel know a user was included
  sendResponse(
    webClient,
    req.channelId,
    `${req.userName} included <@${userId}>`
  );
  return undefined; // no additional messages
}

async function sampleSizeCommand(
  req: CommandRequest
): Promise<string | undefined> {
  switch (req.commandArgs.length) {
    case 1:
      return pickemRepository
        .sampleSize(req.connector, req.channelId)
        .then(sampleSize => {
          return `sample_size is: ${sampleSize}`;
        });
    case 2:
      const sampleSize = parseInt(req.commandArgs[1], 10);
      pickemRepository.setSampleSize(req.connector, req.channelId, sampleSize);
      const webClient = new web.WebClient(req.config.slackApiToken);
      // let the channel know the sample size was changed
      sendResponse(
        webClient,
        req.channelId,
        `${req.userName} set sample_size to ${sampleSize}`
      );
      return undefined; // no additional messages
    default:
      return (
        "Try 'sample_size' to see current setting\n" +
        "or try sample_size number"
      );
  }
}

export function slackHandler(
  event: SlashEvent,
  _context: Context,
  callback: Callback
) {
  const requestSignature = event.headers["X-Slack-Signature"] as string;
  const requestTimestamp = parseInt(
    event.headers["X-Slack-Request-Timestamp"] as string,
    10
  );
  loadConfig().then(config => {
    verifyRequestSignature({
      signingSecret: config.slackSigningSecret,
      requestSignature: requestSignature,
      requestTimestamp: requestTimestamp,
      body: event.body
    });

    const connector = new URLObjectStreamConnector(config.stateUrl);

    const req = qs.parse(event.body);
    const commandText = (req["text"] as string).trim().replace(/ +/, " ");
    const commandArgs = commandText.split(" ", 2);
    const command = commandArgs[0];
    const commandReq = {
      slackCommand: req["command"] as string,
      userName: req["user_name"] as string,
      channelId: req["channel_id"] as string,
      commandText: commandText,
      commandArgs: commandArgs,
      command: command,
      config: config,
      connector: connector
    };
    let messagePromise;

    switch (commandReq.command) {
      case "pick":
        messagePromise = pickCommand(commandReq);
        break;
      case "exclude":
        messagePromise = excludeCommand(commandReq);
        break;
      case "include":
        messagePromise = includeCommand(commandReq);
        break;
      case "sample_size":
        messagePromise = sampleSizeCommand(commandReq);
        break;
      default:
        messagePromise = Promise.resolve(
          `*pick* to pick a user(s) from the current channel\n` +
            `*exclude @username* to exclude a user from being picked\n` +
            `*include @username* to include an excluded user\n` +
            `*sample_size number* to include an excluded user\n` +
            `*help* to see this message\n`
        );
    }
    messagePromise.then(message => {
      const body = JSON.stringify({ text: message });
      if (message) {
        callback(undefined, {
          isBase64Encoded: false,
          statusCode: 200,
          headers: {
            "Content-type": "application/json"
          },
          body: body
        });
      } else {
        callback(undefined, {});
      }
    });
  });
}
