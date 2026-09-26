import { ApiClient, ApiError } from "../src/api";

function mockFetchOnce(status: number, body: unknown) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("ApiClient", () => {
  it("createGroupで正しいリクエストを送り、結果を返す", async () => {
    mockFetchOnce(200, {
      groupId: "g1",
      memberId: "m1",
      inviteCode: "123456",
      inviteCodeExpiresAt: "2026-01-08T00:00:00.000Z",
    });
    const client = new ApiClient("http://api.example.com", "dev-1");

    const result = await client.createGroup("さくら");

    expect(result.groupId).toBe("g1");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.example.com/groups",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-device-id": "dev-1" }),
        body: JSON.stringify({ deviceId: "dev-1", name: "さくら" }),
      })
    );
  });

  it("エラーレスポンスの場合はApiErrorを投げる", async () => {
    mockFetchOnce(410, { error: { code: "CODE_EXPIRED", message: "招待コードの有効期限が切れています" } });
    const client = new ApiClient("http://api.example.com", "dev-2");

    await expect(client.joinGroup("123456", "お母さん")).rejects.toMatchObject({
      status: 410,
      code: "CODE_EXPIRED",
    });
    await expect(client.joinGroup("123456", "お母さん")).rejects.toBeInstanceOf(ApiError);
  });

  it("getMembersはGETリクエストを送る", async () => {
    mockFetchOnce(200, { inviteCode: "123456", members: [] });
    const client = new ApiClient("http://api.example.com", "dev-1");

    await client.getMembers("g1");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.example.com/groups/g1/members",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("removeMemberはDELETEリクエストを送る", async () => {
    mockFetchOnce(200, { ok: true });
    const client = new ApiClient("http://api.example.com", "dev-1");

    await client.removeMember("m2");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.example.com/members/m2",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("deleteGroupはDELETEリクエストを送る", async () => {
    mockFetchOnce(200, { ok: true });
    const client = new ApiClient("http://api.example.com", "dev-1");

    await client.deleteGroup("g1");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.example.com/groups/g1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
