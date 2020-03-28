// import { URL } from "url";

// import { CustomContext } from "./context/custom_context";
// import { objectStreamConnector } from "./connectors/object_stream_connector";
// import { pickemModel } from "./models/pickem";

// export const contextConfig: CustomContext = {
//   config: {
//     stateUrl: () => {
//       return new Promise<URL>((resolve, reject) => {
//         if (process.env.STATE_URL) {
//           const url = new URL(process.env.STATE_URL);
//           return resolve(url);
//         } else {
//           return reject("STATE_URL is not defined");
//         }
//       });
//     }
//   },
//   connectors: {
//     objectStream: objectStreamConnector
//   },
//   models: {
//     pickemModel: pickemModel
//   }
// };
