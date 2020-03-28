import * as fs from "fs";
import { Readable } from "stream";
import { URL } from "url";
import S3 from "aws-sdk/clients/s3";

export interface ObjectStreamModel {
  toObject(): object;
  fromObject(obj: object): void;
}

export interface ObjectStreamConnector {
  load(obj: ObjectStreamModel): Promise<ObjectStreamModel>;
  save(obj: ObjectStreamModel): void;
}

type S3Location = {
  Bucket: string;
  Key: string;
};

function parseS3Url(url: URL): S3Location | undefined {
  const s3loc = {} as S3Location;
  s3loc.Bucket = url.hostname;
  s3loc.Key = url.pathname.slice(1);
  return s3loc;
}

export class URLObjectStreamConnector implements ObjectStreamConnector {
  url: URL;
  constructor(url: URL) {
    this.url = url;
  }

  async parseJSONObjectFromStream(stream: Readable): Promise<object> {
    const chunks: Uint8Array[] = [];
    return new Promise<string>((resolve, reject) => {
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => {
        return resolve(Buffer.concat(chunks).toString("utf8"));
      });
    }).then(jsonData => {
      return JSON.parse(jsonData);
    });
  }

  public load(obj: ObjectStreamModel): Promise<ObjectStreamModel> {
    return new Promise<ObjectStreamModel>((resolve, reject) => {
      if (this.url.protocol == "file:") {
        fs.access(this.url.pathname, fs.constants.R_OK, err => {
          if (err) {
            return reject(err);
          } else {
            const stream = fs.createReadStream(this.url.pathname);
            this.parseJSONObjectFromStream(stream).then(jobj => {
              obj.fromObject(jobj);
              return resolve(obj);
            });
          }
        });
      } else if (this.url.protocol == "s3:") {
        const s3loc = parseS3Url(this.url);
        if (!s3loc) {
          return reject("Cannot parse bucket and key from url");
        }
        const s3 = new S3();
        const stream = s3.getObject(s3loc).createReadStream();
        this.parseJSONObjectFromStream(stream).then(jobj => {
          obj.fromObject(jobj);
          return resolve(obj);
        });
      } else {
        return reject(`Unknown protocol: ${this.url.protocol}`);
      }
    });
  }

  public save(obj: ObjectStreamModel): void {
    if (this.url.protocol == "file:") {
      fs.createWriteStream(this.url.pathname).end(
        JSON.stringify(obj.toObject())
      );
    } else if (this.url.protocol == "s3:") {
      const s3loc = parseS3Url(this.url);
      if (!s3loc) {
        throw Error("Cannot parse bucket and key from url");
      }
      const s3 = new S3();
      const params = { ...s3loc, Body: JSON.stringify(obj) };
      s3.upload(params, (err: Error, _data: unknown) => {
        if (err) {
          throw err;
        }
      });
    } else {
      throw Error(`Unknown protocol: ${this.url.protocol}`);
    }
  }
}
