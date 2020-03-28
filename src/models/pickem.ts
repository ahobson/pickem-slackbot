import {
  ObjectStreamConnector,
  ObjectStreamModel
} from "../connectors/object_stream_connector";

export type UserId = string;
export type ChannelId = string;

interface PickedUserState {
  userId: UserId;
  lastPickedAt: Date;
}

interface PickedUserStateCollection {
  [key: string]: PickedUserState;
}

export const NEVER_PICKED = new Date(2000, 1, 1);

class ChannelState {
  channelId: ChannelId;
  sampleSize: number = 1;
  excludedUsers: Set<UserId> = new Set<UserId>();
  pickedUsers: PickedUserStateCollection = {};

  constructor(channelId: ChannelId) {
    this.channelId = channelId;
  }

  excludeUser(userId: UserId) {
    this.excludedUsers.add(userId);
  }

  includeUser(userId: UserId) {
    this.excludedUsers.delete(userId);
  }

  getExcludedUsers(): Set<UserId> {
    return this.excludedUsers;
  }

  getSampleSize(): number {
    return this.sampleSize;
  }

  setSampleSize(sampleSize: number) {
    this.sampleSize = sampleSize;
  }

  setUserPicked(userId: UserId) {
    if (this.pickedUsers.hasOwnProperty(userId)) {
      this.pickedUsers[userId].lastPickedAt = new Date();
    } else {
      this.pickedUsers[userId] = {
        userId: userId,
        lastPickedAt: new Date()
      };
    }
  }

  getUser(userId: UserId): PickedUserState {
    if (this.pickedUsers.hasOwnProperty(userId)) {
      return this.pickedUsers[userId];
    }
    return {
      userId: userId,
      lastPickedAt: NEVER_PICKED
    };
  }

  fromObject(obj: object) {
    const cso = obj as ChannelState;
    if (obj.hasOwnProperty("channelId")) {
      this.channelId = cso.channelId;
    }
    if (obj.hasOwnProperty("sampleSize")) {
      this.sampleSize = cso.sampleSize;
    }
    if (obj.hasOwnProperty("excludedUsers")) {
      const uarray = Object(obj)["excludedUsers"] as UserId[];
      this.excludedUsers = new Set<UserId>(uarray);
    }
    if (obj.hasOwnProperty("pickedUsers")) {
      this.pickedUsers = {};
      Object.entries(Object(obj)["pickedUsers"]).forEach(([userId, state]) => {
        const pickedState = state as {
          userId: string;
          lastPickedAt: string;
        };
        this.pickedUsers[userId] = {
          userId: userId,
          lastPickedAt: new Date(pickedState.lastPickedAt)
        };
      });
    }
  }

  toObject(): object {
    return {
      channelId: this.channelId,
      sampleSize: this.sampleSize,
      excludedUsers: Array.from(this.excludedUsers),
      pickedUsers: this.pickedUsers
    };
  }
}

interface ChannelStateCollection {
  [key: string]: ChannelState;
}

export class PickemState implements ObjectStreamModel {
  channels: ChannelStateCollection = {};

  public getChannel(channelId: ChannelId): ChannelState {
    if (!this.channels.hasOwnProperty(channelId)) {
      this.channels[channelId] = new ChannelState(channelId);
    }
    return this.channels[channelId];
  }
  public setChannel(channelId: ChannelId, channelState: ChannelState) {
    this.channels[channelId] = channelState;
  }
  public toObject(): object {
    return Object.values(this.channels).map(v => v.toObject());
  }

  public fromObject(obj: object) {
    Object.values(obj).forEach(value => {
      const channelState = value as ChannelState;
      this.channels[channelState.channelId] = new ChannelState(
        channelState.channelId
      );
      this.channels[channelState.channelId].fromObject(value);
    });
  }
}

export interface PickemRepository {
  pick(
    connector: ObjectStreamConnector,
    channelId: ChannelId,
    channelMembers: UserId[]
  ): Promise<UserId | undefined>;
  exclude(
    connector: ObjectStreamConnector,
    channelId: ChannelId,
    userId: UserId
  ): void;
  excluded(
    connector: ObjectStreamConnector,
    channelId: ChannelId
  ): Promise<UserId[]>;
  include(
    connector: ObjectStreamConnector,
    channelId: ChannelId,
    userId: UserId
  ): void;
  sampleSize(
    connector: ObjectStreamConnector,
    channelId: ChannelId
  ): Promise<number>;
  setSampleSize(
    connector: ObjectStreamConnector,
    channelId: ChannelId,
    sampleSize: number
  ): void;
}

export const pickemRepository: PickemRepository = {
  pick: async (
    connector: ObjectStreamConnector,
    channelId: ChannelId,
    channelMembers: UserId[]
  ): Promise<UserId | undefined> => {
    return connector.load(new PickemState()).then(model => {
      const pickem = model as PickemState;
      const channel = pickem.getChannel(channelId);
      const excludedUsers = channel.getExcludedUsers();
      const candidates: PickedUserState[] = [];
      channelMembers.forEach(userId => {
        if (!excludedUsers.has(userId)) {
          candidates.push(channel.getUser(userId));
        }
      });
      if (0 == candidates.length) {
        return undefined;
      }
      candidates.sort((a, b) => {
        return a.lastPickedAt > b.lastPickedAt ? 1 : -1;
      });
      const pickedSample = candidates.slice(0, channel.getSampleSize());
      const i = Math.floor(Math.random() * pickedSample.length);
      const picked = pickedSample[i];
      channel.setUserPicked(picked.userId);

      connector.save(pickem);
      return picked.userId;
    });
  },

  exclude: async (
    connector: ObjectStreamConnector,
    channelId: ChannelId,
    userId: UserId
  ): Promise<void> => {
    return connector.load(new PickemState()).then(model => {
      const pickem = model as PickemState;
      const channel = pickem.getChannel(channelId);
      channel.excludeUser(userId);
      connector.save(pickem);
    });
  },

  excluded: async (
    connector: ObjectStreamConnector,
    channelId: ChannelId
  ): Promise<UserId[]> => {
    return connector.load(new PickemState()).then(model => {
      const pickem = model as PickemState;
      const channel = pickem.getChannel(channelId);
      return Array.from(channel.getExcludedUsers());
    });
  },

  include: async (
    connector: ObjectStreamConnector,
    channelId: ChannelId,
    userId: UserId
  ): Promise<void> => {
    return connector.load(new PickemState()).then(model => {
      const pickem = model as PickemState;
      const channel = pickem.getChannel(channelId);
      channel.includeUser(userId);
      connector.save(pickem);
    });
  },

  sampleSize: async (
    connector: ObjectStreamConnector,
    channelId: ChannelId
  ): Promise<number> => {
    return connector.load(new PickemState()).then(model => {
      const pickem = model as PickemState;
      const channel = pickem.getChannel(channelId);
      return channel.getSampleSize();
    });
  },

  setSampleSize: async (
    connector: ObjectStreamConnector,
    channelId: ChannelId,
    sampleSize: number
  ): Promise<void> => {
    return connector.load(new PickemState()).then(model => {
      const pickem = model as PickemState;
      const channel = pickem.getChannel(channelId);
      channel.setSampleSize(sampleSize);
    });
  }
};
