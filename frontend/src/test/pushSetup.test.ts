import { beforeEach, describe, expect, it } from "vitest";

import {
  PUSH_SETUP_DISMISSED_KEY,
  PUSH_USER_DISABLED_KEY,
  dismissSetupNotice,
  isPushDisabledByUser,
  isSetupNoticeDismissed,
  pushSetupState,
  setPushDisabledByUser,
} from "../push/pushSetup";

type Input = Parameters<typeof pushSetupState>[0];

/** A device that is fine: logged in, supported, server on, granted, subscribed. */
const healthy: Input = {
  token: "tok",
  supported: true,
  serverEnabled: true,
  permission: "granted",
  browserEndpoint: "https://push.example.test/abc",
  userDisabled: false,
};

describe("pushSetupState", () => {
  it("says nothing to a reader", () => {
    expect(pushSetupState({ ...healthy, token: null })).toBe("none");
  });

  it("says nothing where the browser has no push", () => {
    expect(pushSetupState({ ...healthy, supported: false, permission: "unsupported", browserEndpoint: null })).toBe("none");
  });

  it("says nothing while the server has push switched off", () => {
    expect(pushSetupState({ ...healthy, serverEnabled: false, browserEndpoint: null, permission: "default" })).toBe("none");
  });

  it("respects a denied permission — that is a decision", () => {
    expect(pushSetupState({ ...healthy, permission: "denied", browserEndpoint: null })).toBe("none");
  });

  it("is ok as soon as a subscription exists", () => {
    expect(pushSetupState(healthy)).toBe("ok");
  });

  it("re-subscribes silently when permission is granted and the subscription is gone", () => {
    expect(pushSetupState({ ...healthy, browserEndpoint: null })).toBe("resubscribe");
  });

  it("leaves a device alone that turned push off on purpose", () => {
    expect(pushSetupState({ ...healthy, browserEndpoint: null, userDisabled: true })).toBe("none");
  });

  it("asks when nobody has decided on this install and nothing is subscribed", () => {
    expect(pushSetupState({ ...healthy, permission: "default", browserEndpoint: null })).toBe("needs-setup");
  });

  it("does not need stored history to find the reinstalled device", () => {
    // The reinstall wipes local storage too, so `userDisabled` is false either way:
    // the answer must come from permission + subscription alone.
    expect(pushSetupState({ ...healthy, permission: "default", browserEndpoint: null, userDisabled: false })).toBe("needs-setup");
  });
});

describe("the notice's per-install dismissal", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts undismissed and remembers a dismissal", () => {
    expect(isSetupNoticeDismissed()).toBe(false);
    dismissSetupNotice();
    expect(isSetupNoticeDismissed()).toBe(true);
    expect(window.localStorage.getItem(PUSH_SETUP_DISMISSED_KEY)).toBe("1");
  });

  it("comes back for a fresh install (storage gone with the subscription)", () => {
    dismissSetupNotice();
    window.localStorage.clear();
    expect(isSetupNoticeDismissed()).toBe(false);
  });

  it("round-trips the deliberate 'off on this device' marker", () => {
    expect(isPushDisabledByUser()).toBe(false);
    setPushDisabledByUser(true);
    expect(isPushDisabledByUser()).toBe(true);
    setPushDisabledByUser(false);
    expect(isPushDisabledByUser()).toBe(false);
    expect(window.localStorage.getItem(PUSH_USER_DISABLED_KEY)).toBeNull();
  });
});
