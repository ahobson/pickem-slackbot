# pickem-slackbot

slackbot that will pick people at random from a channel, weighting
folks that haven't been picked recently.  It also supports exclusion.

This implementation stores the state in in S3.

It uses the [serverless](https://serverless.com/framework/docs/)
framework for easy development and deployment.

## Development

    docker-compose build
    docker-compose run --rm --entrypoint yarn sls install

### Running tests

    docker-compose run --rm --entrypoint yarn sls test

### Running server for local development

You will need to set the `SLACK_SIGNING_SECRET`, `SLACK_API_TOKEN`,
and `STATE_URL` environment variables.

The first two come from your slack configuration.  The latter is a URL
where the JSON for the channel state is stored.  See more in Configuration

    docker-compose up

## Configuration

### Slack

1. In "OAuth & Permissions", under Scopes, this bot will need
   1. `channel:read`
   1. `chat:write`
   1. `chat:write.public`
   1. `commands`
1. In Slash Commands, create a new command called `/pickem`.  The
   Request URL is the URL printed by serverless after deployment to
   AWS.  The Short Description can be `Pickem Bot` or whatever you
   want.  The Usage Hint might be `help`.
1. Set escaped usernames and channels
1. Under "Basic Information", get the "Signing Secret" and save it for
   later use as `SLACK_SIGNING_SECRET`.
1. Under "Install App", get the "Bot User OAuth Access Token" and save
   it for later use as `SLACK_API_TOKEN`.


### Settings

The state configuration is a URL that points to a location in s3 (e.g. `s3://bucket/key`).

The Signing Secret is under ther `Basic Information` section of your
slackbot as `Signing Secret`.

The Api Token is under they `Install App` as `Bot User OAuth Access Token`.

### Deploying

In development, the configuration is taken from environment variables.
When deploying to AWS, they are fetched from AWS Parameter store.

While serverless can manage more than the lambdas and API Gateway, we
have [decided not to use it that
way](https://github.com/trussworks/gusto-csv-to-airtable/blob/master/docs/adr/0002-serverless-usage.md)

That means you'll need to manage the S3 bucket and AWS lambda role
somewhere else.

Do something like:

    aws ssm put-parameter --type SecureString \
        --name /app/pickembot/dev/slack-api-token \
        --value 'THE-REAL-TOKEN'

    aws ssm put-parameter --type SecureString \
        --name /app/pickembot/dev/slack-signing-secret \
        --value 'THE-REAL-SECRET'

    aws ssm put-parameter --type SecureString \
        --name /app/pickembot/dev/state-url \
        --value s3://SOME-REAL-BUCKET/state.json

    aws ssm put-parameter --type String \
        --name /app/pickembot/dev/slackbot-lambda-role \
        --value arn:aws:iam:SOME:REAL_ARN:HERE

Create a `docker-compose.override.yml` with your AWS credentials.
Something like:

    version: '3'
    services:
      sls:
        environment:
          - AWS_ACCESS_KEY_ID
          - AWS_SECRET_ACCESS_KEY

Or

    version: '3'
    services:
      sls:
        environment:
          - AWS_PROFILE
        volumes:
          - "~/.aws:/root/.aws"

Then do

    docker-compose run --rm sls npx sls deploy

