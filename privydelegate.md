# null

Privy enables your app to add **signers** to wallets that can take actions within the scope of certain permissions. You can use signers to enable various use cases, like:

* **Offline actions**: execute limit orders or agentic trades even while a user is offline in your app.
* **Recurring actions**: implement subscriptions, portfolio rebalancing, and more.
* **Scoping wallet policies to specific parties**: set specific policies on wallets that apply to specific signers (authorization keys, users, or key quorums)
* **Delegating access to third-parties**: allow third-parties to execute certain actions on behalf of a wallet.

Signers can be added to wallets owned by [users, authorization keys, or key quorums](/controls/authorization-keys/owners/overview).

Privy’s architecture guarantees that a **signer** will never see the wallet's private key. All signing takes place in a secure enclave that only your application can make authorized requests to.

Follow the guides below to provision signers for your users' wallets and enable your app to securely interact with these wallets from your servers.

## Get started

<CardGroup>
  <Card title="Add a signer" icon="stamp" href="/wallets/using-wallets/signers/add-signers">
    Add a signer to a user's wallet and start interacting with the wallet from your servers.
  </Card>

  <Card title="Send transactions from your server" icon="gear" href="/wallets/using-wallets/signers/use-signers">
    Send transactions on behalf of your users from a server environment.
  </Card>
</CardGroup>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt
# Add signers

To allow a third-party to transact on wallets, follow the guide below.

<Info>
  This guide assumes your application has already [configured signers](/wallets/using-wallets/signers/configure-signers) in the Dashboard.
</Info>

<Tabs>
  <Tab title="React">
    To provision server-side access for user's wallets, use the `addSigners` method from the `useSigners` hook:

    ```tsx  theme={"system"}
    addSigners: async ({address: string, signers: {signerId: string, policyIds: string[]}[]}) => Promise<{user: User}>
    ```

    ### Usage

    ```tsx  theme={"system"}
    import {useSigners} from '@privy-io/react-auth';
    const {addSigners} = useSigners();
    ```

    <Tip>
      Check out the [starter repo](https://github.com/privy-io/examples/blob/main/privy-next-starter/src/components/sections/session-signers.tsx) for an end to end example of how to use signers.
    </Tip>

    ### Parameters

    The `addSigners` method accepts a `params` object with the following fields:

    <ParamField path="address" type="string" required>
      Address of the embedded wallet to add a signer to.
    </ParamField>

    <ParamField path="signers" type="object[]" required>
      <Expandable defaultOpen="true">
        <ParamField path="signerId" type="string" required>
          The key quorum ID that will be allowed to transact on the wallet. This is the same key quorum ID you generated in the [Generate an authorization key](/wallets/using-wallets/signers/configure-signers) step.
        </ParamField>

        <ParamField path="policyIds" type="string[]">
          An ID for a policy that any transaction from the signer must satisfy to be signed. This is an optional field, if not provided, no policies will apply to the signers requests. Note that at this time, each signer can only have one override policy.
        </ParamField>
      </Expandable>
    </ParamField>
  </Tab>

  <Tab title="React Native">
    To provision server-side access for user's wallets, use the `addSigners` method from the `useSigners` hook:

    ```tsx  theme={"system"}
    addSigners: async ({address: string, signers: {signerId: string, policyIds: string[]}[]}) => Promise<{user: PrivyUser}>
    ```

    ### Usage

    ```tsx  theme={"system"}
    import {useSigners} from '@privy-io/expo';
    const {addSigners} = useSigners();
    ```

    ### Parameters

    The `addSigners` method accepts a `params` object with the following fields:

    <ParamField path="address" type="string" required>
      Address of the embedded wallet to add a signer to.
    </ParamField>

    <ParamField path="signers" type="object[]" required>
      <Expandable defaultOpen="true">
        <ParamField path="signerId" type="string" required>
          The key quorum ID that will be allowed to transact on the wallet. This is the same key quorum ID you generated in the [Generate an authorization key](/wallets/using-wallets/signers/configure-signers) step.
        </ParamField>

        <ParamField path="policyIds" type="string[]">
          An ID for a policy that any transaction from the signer must satisfy to be signed. This is an optional field, if not provided, no policies will apply to the signers requests. Note that at this time, each signer can only have one override policy.
        </ParamField>
      </Expandable>
    </ParamField>
  </Tab>

  <Tab title="NodeJS & REST API">
    Make a request to [update the wallet](/wallets/wallets/update-a-wallet) with the desired `additional_signers` you'd like to add. The wallet owner must [sign](/controls/authorization-keys/using-owners/sign) the request.
  </Tab>
</Tabs>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt

# Use signers

Once your user's have signers added on their wallets, your app can take actions on their behalf. This is done by sending requests to the Privy API to sign transactions with the user's wallet. Follow the guide below to get started with signing transactions on behalf of users.

## Requesting signatures

Wallets provisioned with signers can be used to transact and sign messages on behalf of a user from your server.

To get started, configure the [NodeJS SDK](/basics/nodeJS/setup) or the [REST API](/basics/rest-api/setup). This is how your application will make requests to the Privy API to sign transactions on behalf of users. The signing key you configured in the dashboard is the authorization signing key used to produce authorization signatures when submitting requests.

Once you have configured the NodeJS SDK or REST API, your application can send or sign transactions from a users wallet. Follow the NodeJS or REST API guides in the `Using wallets` section to learn more about signing requests with wallets.

## Getting wallets

From your server, you can query Privy to determine what wallets have been provisioned signers by a given user to allow your app to take actions on their behalf.

<Tabs>
  <Tab title="NodeJS">
    Use the Privy client's `_get` method on the users interface to get the user object for your user. As a parameter to this method, pass the user's ID as a `string`:

    ```tsx  theme={"system"}
    const user = await privy.users()._get('insert-user-did');
    ```

    To get a list of the user's wallets, find all of the user's wallets from the user's linked accounts. Filter the `user.linkedAccounts` array for wallet entries with `type: 'wallet'`:

    ```tsx  theme={"system"}
    const walletsWithSessionSigners = user.linked_accounts.filter(
      (account) => account.type === 'wallet' && 'id' in account && account.delegated
    );
    ```

    This constitutes the user's wallets with any added signers. Wallets with signers will always have the `delegated` flag set to `true`.

    For wallets included in this array, your app may make requests to Privy to execute actions on behalf of the user.
  </Tab>

  <Tab title="NodeJS (server-auth)">
    <Warning>
      The `@privy-io/server-auth` library is deprecated. We recommend integrating `@privy-io/node` for
      the latest features and support.
    </Warning>

    Use the Privy client's `getUser` method to get the user object for your user. As a parameter to this method, pass the user's DID as a `string`:

    ```tsx  theme={"system"}
    const user = await client.getUser({identityToken});
    ```

    To get a list of the user's wallets with signers, first find all of the user's embedded wallets from the user's linked accounts. Filter the `user.linkedAccounts` array for wallet entries with `type: 'wallet'` and `delegated: true`:

    ```tsx  theme={"system"}
    // The `WalletWithMetadata` type can be imported from '@privy-io/server-auth'
    const walletsWithSessionSigners = user.linkedAccounts.filter(
      (account): account is WalletWithMetadata =>
        account.type === 'wallet' && account.delegated === true
    );
    ```

    This constitutes the user's wallets with signers. Wallets with signers will always have the `delegated` flag set to `true`.

    For wallets included in this array, your app may make requests to Privy to execute actions on behalf of the user.
  </Tab>

  <Tab title="REST API">
    Make a `GET` request to:

    ```bash  theme={"system"}
    https://auth.privy.io/api/v1/users/<user-did>
    ```

    Replace `<did>` with your desired Privy DID. It should have the format `did:privy:XXXXXX`.

    Below is a sample cURL command for this request:

    ```bash  theme={"system"}
    curl --request GET https://auth.privy.io/api/v1/users/<user-did> \
    -u "<your-privy-app-id>:<your-privy-app-secret>" \
    -H "privy-app-id: <your-privy-app-id>"
    ```

    Then, to get a list of the user's delegated wallets, inspect the `linked_accounts` field of the response body for all entries with the fields `type: 'wallet'` and `delegated: true`.
  </Tab>
</Tabs>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt