import * as model from "./pickem";
import {
  ObjectStreamConnector,
  ObjectStreamModel
} from "../connectors/object_stream_connector";

class FakeObjectStream implements ObjectStreamConnector {
  fakeState: object;
  constructor(fakeState: model.PickemState) {
    this.fakeState = fakeState.toObject();
  }

  load(obj: model.PickemState): Promise<ObjectStreamModel> {
    return new Promise<ObjectStreamModel>((resolve, _) => {
      const reified = JSON.parse(JSON.stringify(this.fakeState));
      obj.fromObject(reified);
      return resolve(obj);
    });
  }

  save(obj: model.PickemState): void {
    this.fakeState = JSON.parse(JSON.stringify(obj.toObject()));
  }

  toPickemState(): model.PickemState {
    const state = new model.PickemState();
    state.fromObject(this.fakeState);
    return state;
  }
}

describe("Pick", () => {
  it("should pick users with no channel state", async () => {
    const fakeState = new model.PickemState();
    const fos = new FakeObjectStream(fakeState);

    const fakeChannelId = "nope";
    const channelMembers = ["u1", "u2", "u3"];
    const p = await model.pickemRepository.pick(
      fos,
      fakeChannelId,
      channelMembers
    );
    if (p === undefined) {
      // test this way so typescript knows p is defined
      fail("no user picked");
    }
    expect(channelMembers).toContain(p);
    expect(
      fos
        .toPickemState()
        .getChannel(fakeChannelId)
        .getUser(p)
        .lastPickedAt.getMilliseconds()
    ).toBeGreaterThan(model.NEVER_PICKED.getMilliseconds());
  });

  it("should prefer users that have never been picked", async () => {
    const fakeState = new model.PickemState();
    const fakeChannelId = "c0";
    const channelState = fakeState.getChannel(fakeChannelId);
    channelState.setUserPicked("u1");
    const fos = new FakeObjectStream(fakeState);
    const channelMembers = ["u1", "u2"];
    const p = await model.pickemRepository.pick(
      fos,
      fakeChannelId,
      channelMembers
    );
    if (p === undefined) {
      // test this way so typescript knows p is defined
      fail("no user picked");
    }
    expect(p).toEqual("u2");
    expect(
      fos
        .toPickemState()
        .getChannel(fakeChannelId)
        .getUser(p)
        .lastPickedAt.getMilliseconds()
    ).toBeGreaterThan(model.NEVER_PICKED.getMilliseconds());
  });

  it("should pick the user with oldest pickedAt", async () => {
    const fakeState = new model.PickemState();
    const fakeChannelId = "c0";
    const channelState = fakeState.getChannel(fakeChannelId);
    const users = ["u1", "u2", "u3", "u4"];
    users.forEach((u, i) => {
      channelState.pickedUsers[u] = {
        userId: u,
        lastPickedAt: new Date(2010, i + 1, 1)
      };
    });
    const fos = new FakeObjectStream(fakeState);
    const p = await model.pickemRepository.pick(fos, fakeChannelId, users);
    expect(p).toEqual("u1");
  });

  it("should exclude users", async () => {
    const fakeState = new model.PickemState();
    const fakeChannelId = "c0";
    const channelState = fakeState.getChannel(fakeChannelId);
    const allUsers = ["u1", "u2", "u3", "u4"];
    allUsers.forEach((u, i) => {
      channelState.pickedUsers[u] = {
        userId: u,
        lastPickedAt: new Date(2010, i + 1, 1)
      };
    });
    channelState.excludeUser("u1");
    const fos = new FakeObjectStream(fakeState);
    const p = await model.pickemRepository.pick(fos, fakeChannelId, allUsers);
    expect(p).toEqual("u2");
  });

  it("should return undefined if no users are available", async () => {
    const fakeState = new model.PickemState();
    const fakeChannelId = "c0";
    const channelState = fakeState.getChannel(fakeChannelId);
    const user = "u1";
    channelState.excludeUser(user);
    const fos = new FakeObjectStream(fakeState);
    const p = await model.pickemRepository.pick(fos, fakeChannelId, [user]);
    expect(p).toEqual(undefined);
  });
});

describe("Exclude", () => {
  it("should return excluded users", async () => {
    const fakeState = new model.PickemState();
    const fakeChannelId = "c0";
    const channelState = fakeState.getChannel(fakeChannelId);
    channelState.excludeUser("u1");
    const fos = new FakeObjectStream(fakeState);
    const p = await model.pickemRepository.excluded(fos, fakeChannelId);
    expect(p).toEqual(["u1"]);
  });
});
