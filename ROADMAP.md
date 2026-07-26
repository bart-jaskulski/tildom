# Tildom Product and Architecture Roadmap

## Document Status

This document records the current long-term direction for Tildom after reviewing the implemented
applications, local storage model, PWA behavior, encrypted sync, Hey's memory architecture, and the
desired relationship between the applications.

It is a roadmap, not a claim that the target architecture already exists. `PRODUCT.md`,
`PROJECT.md`, application product documents, and the runnable code remain the sources of truth for
current behavior. Where this roadmap differs from older architectural assumptions, it represents
the newer working direction to validate and implement incrementally.

The roadmap is intentionally written for the project's present reality: Tildom currently has one
user and can accept substantial rewrites when they produce a materially better product. Migration
cost still matters, especially where browser-local data could be lost, but preserving an early
implementation is not itself a product goal.

## Executive Summary

Tildom should evolve from a collection of related applications on separate subdomains into one
trusted, local-first suite on a shared origin. Mark, Do, Kin, and Hey should remain focused,
independently installable applications, but they should share suite navigation, an offline Home
launcher, a device-level key hierarchy, and an intentional local data-access boundary.

The proposed hosted layout is:

- `tildom.app/home/` for the offline suite launcher and trust page;
- `tildom.app/mark/` for bookmarks and notes;
- `tildom.app/do/` for tasks;
- `tildom.app/kin/` for people and relationships;
- `tildom.app/hey/` for conversations and personal AI;
- `tildom.app/` as a stable entry point that redirects or routes to Home;
- `sync.tildom.app` for opaque encrypted storage;
- `api.tildom.app` for network-required features and AI inference.

Each product application should keep its own manifest identity, service-worker scope, SQLite
database, domain schema, product behavior, and deployment artifact. The shared origin is a
deliberate declaration that the applications form one trusted personal suite rather than separate
security principals.

Hey should eventually be able to explore suite data through a browser-executed virtual filesystem.
The model runs remotely by default, requests shell-like local operations, and receives only the
results of those operations. Canonical product data remains in browser SQLite/OPFS. The virtual
filesystem is an interface over domain data, not a replacement for structured storage.

Sync should remain encrypted and app-scoped, but all application keys should be derived from one
suite root key so a device is paired once. Hosted entitlements may later be capability-based and
accountless. Encryption keys, sync authorization, and payment entitlement must remain distinct
concepts.

## Product Direction

### One suite, several focused tools

Tildom should feel like one product family without turning every workflow into one large
application. Mark, Do, Kin, and Hey have different jobs and should preserve their focused
interfaces. The suite should unify what benefits from being shared:

- identity and naming;
- application discovery and switching;
- installation expectations;
- device pairing;
- encrypted sync configuration;
- privacy language;
- selected preferences;
- local AI access to suite data;
- hosted-service entitlement.

It should not unify product schemas, route structures, or feature behavior merely for architectural
symmetry.

### Direct launch remains important

The preferred mobile behavior is one tap to open the intended application. A central launcher
must not become a mandatory intermediate screen.

Every application should therefore remain independently installable with its own name and icon.
Home may also be installable for users who prefer a suite launcher, but installing Home should not
be required to use or install another application.

### Home becomes a real offline product surface

Home currently describes offline applications while behaving as an online-only portal. The target
Home experience should:

- load offline after the first successful visit;
- provide clear links to every application;
- indicate the suite relationship without obscuring individual app names;
- explain local storage, sync, and AI network boundaries accurately;
- offer installation when supported;
- remain useful as a launcher when the network is unavailable;
- avoid becoming a dashboard that duplicates application data without a proven need.

### Product names and navigation

The short names Mark, Do, Kin, and Hey should remain primary. Shared Tildom identity should make the
applications easier to recognize and find rather than replacing their names.

Each application should expose a quiet, consistent suite switcher. It should support touch and
keyboard use, preserve the existing text-tool visual language, and avoid turning the header into a
large application dashboard. Navigation should work online and offline for previously cached
applications.

## Architectural Principles

The following principles govern the roadmap:

1. **Local data remains canonical.** Product data begins in browser storage and remains usable
   without hosted sync.
2. **Offline behavior is product behavior.** Network availability may extend an application but
   must not gate its local core.
3. **The suite is one trusted browser boundary.** A shared origin is intentional because the
   products are expected to cooperate and Hey may access their data.
4. **Application ownership remains explicit.** Each app owns its schema, validation, migrations,
   and domain behavior.
5. **Structured data remains structured.** SQLite remains the canonical representation for
   bookmarks, tasks, contacts, chats, and settings.
6. **Filesystem access is an interface.** A virtual filesystem may expose domain data to an agent
   without converting canonical records into loose files.
7. **Disclosure is selective and transient.** Remote inference receives only the prompt, requested
   tool results, and conversation context needed for the active run.
8. **Remote storage is encrypted before upload.** Sync services store opaque ciphertext and do not
   receive application plaintext.
9. **Useful security claims must be precise.** Tildom must not imply that third-party inference is
   end-to-end encrypted or invisible to the model provider.
10. **Agent writes are reversible.** Broad capability should not make accidental deletion or
    corruption irreversible.
11. **Self-hosting remains a first-class path.** Hosted convenience must not become a requirement
    for local product use.
12. **Complexity must follow demonstrated value.** Event sourcing, recovery, billing, and local AI
    should be introduced only when their preceding foundations work.

## Current Position

### Applications

The repository contains runnable Home, Mark, Do, Kin, and Hey applications. All use Solid and
Vite. Product data is stored in browser SQLite backed by OPFS; Home has no product database.

Mark, Kin, and Hey use the shared encrypted snapshot sync client. Do has an older vault model and
stubbed client synchronization and is not yet aligned with the shared sync foundation.

Each product application currently assumes root-relative routes, assets, manifest scope, and
service-worker behavior on its own origin. Moving to path deployment requires coordinated base
path, router, manifest, asset, share-target, pairing, and service-worker changes.

### Local data

SQLite and OPFS are not competing storage choices in the current architecture. SQLite database
files are already persisted through OPFS. Moving a record from a table to a raw OPFS file would
change its data model, transactional guarantees, and query behavior without changing the browser
storage boundary.

The applications currently use separate database filenames and schemas. This separation should
remain. Shared origin storage should not lead to one omnibus suite database.

### Hey

Hey stores chats, messages, settings, drafts, and virtual memory files in `hey.sqlite3`. Memory
files are represented as paths and content in SQLite.

The current API request sends the active conversation and the complete memory-file collection to
the feature service. That behavior does not yet meet the intended bounded-disclosure model and
must be replaced before broad cross-application access is enabled.

### Sync

The shared sync client:

- derives app-specific vault identity, authorization, and encryption material;
- encrypts complete SQLite snapshots in the browser;
- uploads opaque envelopes;
- uses revision preconditions to avoid blind overwrites;
- retains a small number of revisions on the service.

The current conflict path can replace locally dirty state with a newer remote snapshot. This is
acceptable only as an early single-user implementation and must become non-destructive before sync
is considered robust.

### Hosted services

The sync service is a deliberately opaque encrypted-blob store. The feature API processes
plaintext required for metadata, task breakdown, and AI conversation features. These are different
trust boundaries and should remain logically separate even if future deployments share
infrastructure.

## Target Browser and PWA Architecture

### Shared origin

All browser applications should move to non-overlapping paths on `tildom.app`. The primary reasons
are:

- one suite pairing flow can populate one origin-scoped key store;
- applications can intentionally cooperate through shared browser facilities;
- Home and suite navigation can work offline;
- Hey can access local data without uploading whole databases or building cross-origin relays;
- application installation can remain path-scoped;
- browser behavior matches the product's intended trust model.

This change removes browser-enforced isolation between applications. Any script executing on the
origin may become capable of reaching suite storage. Security review must therefore treat every
application and shared dependency as part of the same trusted computing base.

### PWA identity and scope

Each application should have:

- a stable and explicit manifest identity;
- a start URL inside its own path;
- a manifest scope ending at its application path;
- a service worker served from and limited to that path;
- path-aware navigation fallbacks;
- path-aware asset and cache keys;
- a distinct install name and icon;
- no accidental scope overlap with another application.

Home should live under `/home/` rather than claim the root scope. The root URL may redirect to Home
without becoming a competing installed application identity.

Before committing the production deployment, the path-scoped installation model must be tested on
the actual Chrome desktop and Android environments used for Tildom. Tests should cover:

- installing every application separately;
- installing Home independently;
- opening an application from its home-screen icon;
- switching between installed and uninstalled applications;
- link capture from Home and from another installed application;
- offline launch;
- service-worker updates and cache isolation;
- uninstalling one application without breaking another;
- clearing site data and communicating the suite-wide consequence.

### Deployment independence

Shared origin does not require one frontend bundle or one container image. A reverse proxy may
route each path to its independently built static application. Each image should remain
independently buildable and deployable.

The deployment layer must serve consistent security headers and must not allow one application's
SPA fallback to capture another application's routes.

### Existing subdomains

Existing subdomains should remain temporarily as migration and compatibility entry points. They
may:

- show an explicit migration flow;
- export or sync the old origin's local database;
- redirect only after local data is safely transferred;
- remain available long enough to recover a missed installation.

A blind redirect is insufficient because OPFS, IndexedDB, caches, and service-worker state do not
move between origins.

## Suite Data and Cooperation

### Application-owned databases

Each application continues to own a separate SQLite file. Application code remains responsible for:

- schema definition;
- migrations;
- validation;
- domain invariants;
- query behavior;
- import and export;
- synchronization hooks;
- destructive-operation semantics.

Hey or shared infrastructure should not issue arbitrary SQL directly against another application's
tables. That would couple agent behavior to schema details and bypass domain validation.

### Suite data catalog

The suite should introduce a small catalog describing which application-owned resources are
available to local agent access. The catalog should describe stable concepts such as bookmarks,
people, tasks, chats, and memory rather than expose database tables.

Each application adapter should provide the minimum operations needed to present its resources as
a virtual filesystem and to commit valid changes. The adapter is an application boundary, not a
generic repository abstraction.

### Default access policy

For the current single-user product, Hey may receive broad suite access by default. This should
still be visible and configurable:

- the settings surface should state which applications are available;
- the user should be able to disable an application;
- read and write capability should be separately representable even if both default to enabled;
- the product should not repeatedly interrupt normal use with confirmation dialogs;
- sensitive future resource classes may introduce narrower policy if needed.

The policy is designed for user control and future clarity, not for pretending that path-scoped
applications are isolated from one another.

## Virtual Filesystem and Agent Tools

### Purpose

The virtual filesystem gives the model a general, composable way to explore personal data without
uploading full databases or requiring a new server endpoint for every question.

The intended experience is conceptually similar to navigating a small personal filesystem:

- application names appear as top-level directories;
- domain records appear as readable files;
- stable identifiers prevent ambiguity;
- metadata and prose can be searched together;
- familiar operations can list, find, read, search, create, edit, move, and remove resources.

### Canonical storage remains SQLite

The virtual filesystem should be generated from application adapters. It should not require
bookmark, task, contact, or chat records to be stored as raw files.

For personal-scale datasets, the first implementation may materialize a temporary in-memory view
for an agent run. This is simpler than translating every search operation into SQL and avoids
making shell behavior depend on database query planning.

Large datasets, performance measurements, or memory limits may later justify lazy reads, indexed
search, or command-specific query optimization.

### Shell strategy

The first implementation should evaluate a browser-capable interpreter such as `just-bash` before
building a custom shell. A mature interpreter provides parsing, quoting, pipelines, redirects,
globbing, exit status, and familiar commands that would otherwise become an expanding internal
language.

A custom command dispatcher is acceptable only if the desired language remains intentionally
small. It should not be described as Bash unless it provides Bash-compatible behavior.

The shell runs in the browser against a restricted virtual filesystem. It does not run host
commands, access the user's real filesystem, execute downloaded binaries, or provide general
network access.

### Read behavior

Broad read access may be automatic. The browser executes requested operations locally and returns
only their textual or structured output to the remote inference loop.

The implementation should enforce:

- path normalization and traversal protection;
- output size limits;
- result truncation with explicit continuation;
- cancellation and execution time limits;
- stable text serialization;
- no access outside registered suite mounts;
- no hidden inclusion of unrelated records.

### Write behavior

The model may eventually write across applications, but writes must pass through application
adapters and domain validation.

Filesystem-like operations should map to safe domain behavior:

- creating a file creates a validated domain record;
- replacing content updates a record through its owning application;
- moving or renaming maps only where the domain supports it;
- removal creates a tombstone or recoverable deletion;
- invalid content fails without partially mutating data.

Every agent run that mutates data should produce a local operation group that can be reviewed and
undone. The interface may remain quiet during successful operation, but recovery must not depend on
manually reconstructing the previous state.

Raw database writes, schema changes, destructive database replacement, and sync-key operations are
outside the shell boundary.

### Memory

Hey's current durable memory should become one mount in the same virtual filesystem rather than a
separate family of model tools. Existing memory remains inspectable and editable in the Hey user
interface.

The move to a general shell must preserve the product's memory principles:

- do not save transient moods or unnecessary secrets by default;
- do not silently turn full conversations into durable memory;
- keep memory user-readable;
- allow correction and deletion;
- avoid exposing routine internal tool activity in normal conversation.

## Remote Agent Protocol

### Browser-mediated execution

The remote model must not directly access browser storage. Tool execution follows a client-mediated
loop:

1. The browser submits the user message and necessary conversation context.
2. The feature service invokes the configured model with a browser-executed shell tool.
3. The model requests a local operation.
4. The service streams the tool request to the browser and pauses that model step.
5. The browser checks local capability policy and executes the operation.
6. The browser submits the result associated with the tool call.
7. The service continues inference with that result.
8. The loop ends with a response or a bounded step limit.

Only requested results cross the network. The complete virtual filesystem and complete application
databases are not sent as model context.

### Transport

WebSockets are not required for the initial protocol. Streamed HTTP responses and correlated
follow-up requests are sufficient and fit the request-driven nature of browser-local execution.

The protocol should prefer stateless or reconstructable server behavior:

- the browser retains the durable conversation;
- tool calls and results have stable identifiers;
- retries do not repeat committed writes;
- a dropped connection can resume or fail clearly;
- plaintext state is not retained merely to keep a socket alive.

WebSockets may be reconsidered if a measured need emerges for lower-latency multi-step sessions,
server push, or a long-running foreground agent. They do not solve background execution when the
browser and local data are unavailable.

### Disclosure correction

Before cross-application tools ship, Hey must stop sending the complete memory collection on every
turn. The active context sent before a tool request should be bounded. Additional memory or suite
data should be acquired through explicit local tool results.

The request and response protocol must set limits for:

- conversation history;
- tool steps;
- individual tool output;
- total disclosed bytes;
- execution duration;
- repeated or recursive searches;
- write volume.

## Privacy and Security Model

### Product promise

Tildom should make a precise promise:

> Canonical application data lives on the user's device. Sync stores only client-encrypted data.
> When Hey or another network-assisted feature is used, the prompt and the parts of local data
> needed for that request are temporarily processed by Tildom's feature service and its configured
> model provider. Tildom does not retain that plaintext as product data or use it for training.

This promise distinguishes encrypted storage from active inference. It does not claim that a model
can reason over data without seeing it.

### Trust boundaries

The target architecture has four relevant boundaries:

1. **Browser suite:** trusted with plaintext application data, local keys, local tools, and agent
   write commits.
2. **Sync service:** trusted to store and return opaque ciphertext correctly, but not trusted with
   plaintext or encryption keys.
3. **Feature API:** trusted to process transient plaintext required by a request and to avoid
   retaining or leaking it.
4. **Model provider:** receives the prompt and selected tool results required for inference under
   the provider's retention, training, and privacy terms.

The model provider boundary must remain visible in settings and documentation. Provider changes
must not silently weaken the stated behavior.

### Plaintext handling

The feature API should:

- avoid logging request bodies, prompts, tool arguments, tool results, and generated responses;
- prevent error tracking from capturing those values;
- use bounded request sizes and execution times;
- avoid durable server-side conversation state;
- avoid caches containing plaintext responses;
- redact operational logs;
- configure provider-side training and retention controls where available;
- document unavoidable provider behavior accurately.

Application-layer encryption to the feature API is not a near-term requirement while the API must
decrypt data to call a third-party provider. TLS remains required for transport security.

If Tildom later operates its own inference servers, encryption directly to the inference boundary,
no-log processing, and tighter internal routing may be evaluated.

### Shared-origin security

Because all applications share one origin, defenses must be applied consistently:

- a restrictive Content Security Policy;
- no unreviewed third-party scripts;
- safe rendering of Markdown and imported content;
- protection against stored and reflected script injection;
- dependency review and timely security updates;
- consistent COOP, COEP, CORP, and content-type headers;
- narrowly scoped service workers;
- validation at every import and agent-write boundary;
- explicit handling of untrusted bookmark pages and metadata.

The suite should assume that compromise of one application can threaten all local suite data.

## Suite Keys and Device Pairing

### Suite root key

The browser should create one random suite root key when sync is first enabled. That key is the
root of device ownership and is never uploaded in plaintext.

App-specific material should be derived from the suite root using domain-separated key derivation.
Each application receives distinct encryption, vault identity, and authorization material. A
failure or protocol change in one app should not require snapshots from different apps to share a
key or storage directory.

### One pairing flow

A new device should be paired once:

1. An existing device creates a pairing link or QR containing the suite secret in a URL fragment or
   another client-only transfer envelope.
2. The new device opens a suite pairing route.
3. The suite stores the root key in the shared origin's local key store.
4. Each installed or subsequently opened application derives its own sync configuration.
5. Enabled applications download and decrypt their own latest snapshots.

The server must not receive the fragment or suite root key. Pairing UI should explain that the link
grants access to all enabled Tildom data on the paired device.

### Per-app sync control

One root key does not require every app to upload data. Suite settings should support:

- sync enabled or disabled for the suite;
- per-application participation;
- per-application status and last successful sync;
- one device-pairing identity;
- removal of local sync configuration without silently deleting local product data.

### Key storage

The initial implementation may store the suite key in origin-scoped browser storage, consistent
with the current pairing model. Stronger local key wrapping, user-presence checks, or platform
credentials may be evaluated later.

Recovery is explicitly deferred. Until recovery exists, losing every paired device and the suite
secret means losing access to encrypted remote data.

## Sync Evolution

### Near-term objective

Sync must first become a safe encrypted backup and low-conflict device handoff mechanism. The
project's normal behavior is sequential use: allow one device to complete sync before editing on
another.

The interface should make pending and completed sync legible enough to support that behavior
without creating constant status noise.

### Non-destructive conflicts

The immediate sync requirement is that no locally dirty snapshot is silently destroyed when a
newer remote revision exists.

On conflict, the client should preserve:

- the local candidate snapshot;
- the remote snapshot;
- their known base revision;
- device and timestamp metadata needed for recovery.

The first conflict experience may be conservative. Preserving both versions and asking the user to
choose or export one is better than implementing an incorrect generic merge.

### App alignment

Do should migrate to the shared sync client and suite key model before advanced sync protocols are
introduced. Old Do-specific sync routes and unused vault code should be removed after migration is
verified.

### Merge evolution

If real concurrent offline editing becomes common, merging should be designed per domain:

- append-oriented chat messages;
- mutable memory files;
- bookmark metadata and notes;
- contact fields and relationship notes;
- tasks, ordering, completion, and deletion.

Updated timestamps alone are not a sufficient universal merge model. Tombstones, stable record
identities, device identity, and operation idempotency may be required.

### Event sourcing

Full event sourcing is not a prerequisite for the suite migration, shared pairing, or local agent.
It should be considered only after conflicts are preserved and real merge requirements are
observed.

An encrypted operation-log design would require:

- app-owned event schemas;
- deterministic and idempotent replay;
- causal or base-revision metadata;
- deletion semantics;
- snapshot compaction;
- schema migration of historical events;
- bounded storage and download behavior;
- recovery from malformed or partially applied events.

The sync server should remain unable to interpret plaintext events. Merge and replay therefore
remain client responsibilities.

## Hosted Features and Entitlements

### No conventional account requirement

Paid hosted services do not inherently require usernames, passwords, profiles, or server-readable
product data. A capability-based suite identity can represent a subscription.

The system should distinguish:

- the suite root key, which protects data;
- app-specific sync authorization, which grants access to an encrypted vault;
- a hosted-service credential, which proves entitlement;
- payment-provider records, which process payment but do not decrypt product data.

### Anonymous or pseudonymous entitlement

A future checkout may activate an opaque suite service identity. The hosted service needs to know
only that the holder of a valid credential is entitled to particular capabilities until a date.

Possible capabilities include:

- hosted encrypted sync;
- Hey inference;
- future network-required features.

Pairing should transfer the entitlement credential with the suite configuration so a second device
does not require another purchase or login.

The server may be able to associate multiple hosted requests with one paid suite. That is
pseudonymous service identity, not zero metadata. This tradeoff should be documented rather than
hidden.

### Billing isolation

Billing and entitlement checks belong in hosted infrastructure. Local applications remain fully
usable without payment, and self-hosted services may define their own access policy.

Pricing, payment integration, renewals, taxes, refunds, abuse prevention, and credential recovery
are deferred until hosted sync and Hey have reliable operating costs and demonstrated value.

The current price ideas are hypotheses, not commitments.

## AI Runtime Evolution

### Server inference first

The first general agent should use remote inference because it offers the broadest device support
and strongest model capability. Its local tool protocol should not depend on a particular model
vendor.

Provider adapters should preserve:

- streaming;
- structured tool calls;
- cancellation;
- bounded multi-step execution;
- provider-specific retention configuration;
- accurate cost and error reporting.

### Local inference later

Chrome's built-in AI APIs and WebGPU-based models may eventually support private local inference on
capable devices. The roadmap should preserve this option without making it a launch dependency.

The browser-side virtual filesystem and tool executor should be reusable by both remote and local
models. Runtime selection may later consider:

- browser API availability;
- model download state;
- device memory and compute capability;
- requested task complexity;
- latency;
- offline status;
- user preference.

Local inference may first serve narrow tasks such as rewriting, categorization, summarization, or
simple retrieval. A server fallback remains necessary until local models provide adequate quality
and coverage on the actual devices used.

## Service and Deployment Direction

### Sync and feature API remain separate

Sync and API may share hosting infrastructure, deployment automation, authentication helpers, or
an ingress layer, but they should remain logically separate services:

- sync accepts ciphertext and must not depend on model-provider configuration;
- API processes plaintext required for explicit network features;
- incidents and logs have different sensitivity;
- self-hosters may want sync without AI;
- privacy explanations depend on the boundary being real.

Merging code or processes is acceptable only if the trust boundary remains enforceable and
auditable. A single generic service should not blur encrypted storage and plaintext inference.

### Reverse proxy

The hosted deployment should route path-scoped applications on `tildom.app` while preserving
independent frontend images. Host-specific routing configuration remains an operator concern
outside the application repository, while the repository should provide enough local composition
to validate the topology.

### Self-hosting

Self-hosting should support:

- the full path-scoped suite;
- individual applications where practical;
- encrypted sync without AI;
- API features with operator-provided model credentials;
- explicit configuration of public origins and service URLs;
- persistent storage only for services that own server-side state.

## Delivery Roadmap

The phases below are ordered by dependency and risk. They are not calendar commitments.

### Phase 0: Record and validate the direction

Objectives:

- adopt this roadmap as the working architectural direction;
- reconcile conflicting statements in `PROJECT.md`, `PRODUCT.md`, and app documents;
- define the shared-origin threat model;
- confirm that one trusted suite boundary is acceptable;
- preserve exports and encrypted snapshots before migration work.

Exit criteria:

- documentation distinguishes current and target behavior;
- no document still presents subdomain isolation as an unquestioned long-term requirement;
- every product database has a verified export or sync recovery path.

### Phase 1: Suite navigation and offline Home

Objectives:

- introduce a consistent application switcher;
- make Home offline-capable;
- clarify application names and suite identity;
- validate navigation among currently deployed applications;
- improve install language and status.

This phase may ship before the origin migration and should avoid coupling navigation UI to the
final hosting topology.

Exit criteria:

- Home reopens offline;
- each application can reach every other application and Home;
- direct launch remains the primary path on mobile;
- navigation is usable by touch and keyboard;
- no application requires Home as an intermediate step.

### Phase 2: Path-scoped PWA prototype

Objectives:

- make each build path-aware;
- assign stable manifest identities and non-overlapping scopes;
- scope service workers and caches correctly;
- run all applications under one local origin;
- test installation and link capture on actual target devices.

The prototype may use disposable data. It should validate browser behavior before production data
migration is implemented.

Exit criteria:

- all five applications install independently;
- direct launch opens the intended app;
- one app's service worker does not serve another app's shell;
- offline launch works;
- asset caching and updates work;
- installed and uninstalled app navigation behavior is understood and acceptable.

Decision gate:

- proceed only if current Chrome behavior delivers a reliable enough installed-app experience;
- otherwise choose between one suite PWA, retained subdomains, or a narrower shared-origin design.

### Phase 3: Production origin migration

Objectives:

- deploy the path-scoped topology;
- provide safe migration from every old subdomain;
- preserve existing local data, sync configuration, and user expectations;
- retain subdomain recovery entry points temporarily.

Exit criteria:

- each old database has been migrated or explicitly archived;
- no migration step silently overwrites a non-empty target database;
- pairing and share-target URLs use the new paths;
- old service workers cannot trap navigation;
- rollback and manual export remain available until migration is verified.

### Phase 4: Suite key and unified pairing

Objectives:

- introduce the suite root key;
- derive app-specific sync material;
- store suite configuration once per origin;
- pair a new device through one suite route;
- allow per-app sync participation.

Exit criteria:

- one pairing operation configures every enabled application;
- the sync server never receives the suite root;
- app vaults remain cryptographically and operationally separate;
- removing one app's sync state does not corrupt another's;
- the paired-device warning accurately describes suite-wide access.

### Phase 5: Sync safety and Do alignment

Objectives:

- preserve both sides of every snapshot conflict;
- add device and ancestry metadata needed for recovery;
- move Do to the shared sync implementation;
- remove obsolete Do sync infrastructure;
- validate sequential multi-device use.

Exit criteria:

- dirty local state is never silently discarded;
- conflict artifacts can be inspected or exported;
- Mark, Do, Kin, and Hey use one maintained client foundation;
- automated tests cover initial upload, join, offline changes, conflicts, retries, and import
  failure.

### Phase 6: Correct Hey disclosure

Objectives:

- stop submitting all memory files by default;
- implement bounded conversation context;
- introduce the browser-mediated client-tool loop;
- keep current memory tools working until the new path is verified.

Exit criteria:

- a normal turn does not upload the complete memory collection;
- requested tool outputs are visible in development diagnostics without leaking into production
  logs;
- retries are idempotent;
- cancellation works;
- tool and total disclosure limits are enforced.

### Phase 7: Read-only suite virtual filesystem

Objectives:

- define the suite data catalog;
- implement read adapters for Mark, Do, Kin, and Hey;
- evaluate `just-bash` or a deliberately smaller interpreter;
- expose listing, reading, finding, and searching;
- make broad read access configurable.

Exit criteria:

- Hey can answer cross-app questions without pre-uploading databases;
- the model can identify and read relevant people, bookmarks, tasks, and memories;
- paths are stable and human-readable;
- traversal and output limits are tested;
- application schema changes do not leak directly into the model contract.

### Phase 8: Reversible agent writes

Objectives:

- add validated write adapters;
- define local operation groups and undo;
- support safe create, edit, move, and delete behavior where meaningful;
- handle partial failure without corrupting product data;
- mark sync dirty only after successful commits.

Exit criteria:

- every model mutation is attributable to an agent run;
- one run can be undone locally;
- invalid content cannot bypass domain invariants;
- deletion is recoverable;
- retried tool results do not duplicate writes;
- sync correctly carries committed changes.

### Phase 9: Hosted entitlement experiment

Prerequisites:

- reliable hosted sync;
- measurable operating costs;
- stable pairing;
- a reason to charge beyond architectural possibility.

Objectives:

- define an opaque suite service identity;
- separate entitlement from encryption and vault authorization;
- prototype paid capability issuance and renewal;
- preserve self-hosted and free local use.

Exit criteria:

- payment systems never receive encryption keys;
- hosted services can authorize capabilities without product accounts;
- pairing transfers entitlement safely;
- expiration does not lock local data;
- privacy documentation explains payment metadata accurately.

### Phase 10: Advanced sync and local AI experiments

This phase contains independent investigations rather than one release.

Possible sync work:

- app-specific merge policies;
- operation logs;
- event replay;
- compaction;
- better conflict UI.

Possible AI work:

- Chrome built-in AI;
- WebGPU models;
- local-first retrieval and summarization;
- automatic runtime selection;
- self-hosted open-model inference;
- encrypted routing to a dedicated inference boundary.

Each investigation should have a measured product problem, a small prototype, and an explicit
decision before becoming infrastructure.

## Migration and Data Safety

### Origin migration checklist

Every application migration must account for:

- OPFS database files;
- IndexedDB sync state;
- local preferences;
- service-worker caches;
- install identity;
- pending local changes;
- pairing fragments and saved links;
- share targets;
- exports and backups;
- a non-empty target database.

Migration should be app-by-app and observable. A user must never be told that migration succeeded
until the target application has opened and validated the imported database.

### Database naming

Database paths should become explicit and app-namespaced within the shared OPFS. Existing names may
be preserved during import, but the final layout should avoid collisions and make ownership clear.

Changing a database path is a data migration and must not rely on SQLite initialization creating a
new empty database silently.

### Compatibility

Old pairing URLs, bookmarks, and app links may remain in use. Redirect and compatibility behavior
should be versioned and retained long enough for the known user and paired devices to migrate.

## Quality and Verification

### Required verification areas

The roadmap raises the importance of several end-to-end checks:

- independent PWA installation;
- offline launch and navigation;
- service-worker scope isolation;
- local database migration;
- suite key derivation and pairing;
- encrypted sync round trips;
- conflict preservation;
- browser tool execution;
- disclosure bounds;
- reversible agent writes;
- no plaintext logging;
- mobile touch behavior;
- keyboard navigation;
- self-hosted routing.

### Security review triggers

A focused security review is required before:

- production shared-origin migration;
- suite-wide key storage;
- enabling cross-app reads;
- enabling agent writes;
- introducing hosted entitlements;
- changing model providers;
- claiming stronger inference privacy.

### Observability

Operational visibility must not depend on collecting user plaintext. Prefer:

- request identifiers;
- status codes;
- timing;
- byte counts;
- tool names without arguments;
- provider and model identifiers;
- bounded error categories;
- client-visible diagnostics controlled by the user.

Debug modes that capture plaintext must be explicit, local where possible, disabled by default, and
unsuitable for production.

## Success Measures

The roadmap succeeds when:

- each application still opens directly from one icon;
- the suite feels connected without requiring a central detour;
- Home and installed applications work offline;
- one device pairing enables encrypted sync across selected apps;
- sync cannot silently destroy a dirty local database;
- Hey can answer useful cross-app questions without uploading entire databases;
- Hey can make useful, reversible changes through application-owned validation;
- the sync server stores no plaintext product data;
- AI plaintext is transient and disclosed accurately;
- local-only and self-hosted use remain viable;
- complexity added in later phases corresponds to observed use rather than imagined scale.

## Explicit Non-Goals

The current roadmap does not commit to:

- multi-user collaboration;
- shared family or team vaults;
- mandatory user accounts;
- server-readable product databases;
- generic autonomous background agents;
- agent access while no browser client is available;
- arbitrary host filesystem or network access from the shell;
- one omnibus frontend bundle;
- one omnibus container image;
- a shared application database;
- immediate event sourcing;
- immediate data recovery;
- immediate billing;
- a specific model vendor;
- local inference as a baseline requirement;
- a tool marketplace, MCP ecosystem, or user-installable agent skills.

## Open Decisions

The following questions should be resolved by prototypes or implementation pressure:

1. Whether Chrome handles multiple installed path-scoped PWAs reliably enough on every target
   device.
2. Whether Home should be installable or remain an offline browser launcher.
3. Whether the virtual filesystem should be fully materialized per run or use lazy application
   adapters.
4. Whether `just-bash` is an acceptable browser dependency after bundle, security, and API review.
5. What stable file representation best balances model usability with domain validation.
6. Which write operations should be enabled in the first writable release.
7. How operation-group undo interacts with later synchronization.
8. How much conversation context should be sent before local retrieval begins.
9. Which model provider offers an acceptable balance of capability, cost, retention, and privacy.
10. Whether hosted inference should eventually move to Tildom-controlled open models.
11. Whether real conflicts justify app-specific merging or event logs.
12. Whether paid hosted services need recovery or customer identity beyond an entitlement
    capability.

## Decision Discipline

This roadmap should be updated when evidence changes the direction. Each major phase should record:

- the product problem being solved;
- the observed behavior that justifies it;
- the chosen design;
- rejected alternatives and why;
- migration and rollback behavior;
- new privacy or security claims;
- verification performed;
- remaining limitations.

The target architecture is ambitious, but it is not all-or-nothing. Suite navigation, offline Home,
safe sync, bounded disclosure, cross-app reads, agent writes, hosted entitlements, and local AI each
deliver value independently. The project should preserve that incremental shape and stop at the
first version that is genuinely useful.
