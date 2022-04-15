const core = require('@actions/core');
const S3 = require('aws-sdk/clients/s3');
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const klawSync = require('klaw-sync');
const { lookup } = require('mime-types');

const AWS_KEY_ID = core.getInput('aws_access_key_id', {
	required: true
});

const SECRET_ACCESS_KEY = core.getInput('aws_secret_access_key', {
	required: true
});

const BUCKET = core.getInput('aws_s3_bucket_name', {
	required: true
});

const SOURCE_DIR = core.getInput('source_dir', {
	required: true
});

const DESTINATION_DIR = core.getInput('destination_dir', {
	required: false
});

const AWS_REGION = core.getInput('aws_region', {
	required: true
});

const s3 = new S3({
	accessKeyId: AWS_KEY_ID,
	secretAccessKey: SECRET_ACCESS_KEY,
	region: AWS_REGION
});

const destinationDir = DESTINATION_DIR === '/' ? shortid() : DESTINATION_DIR;

const paths = klawSync(SOURCE_DIR, {
	nodir: true,
	depthLimit: 1
});

function upload(params) {
	return new Promise(resolve => {
		s3.upload(params, (err, data) => {
			if (err) core.error(err);
			core.info(`uploaded - ${data.Key}`);
			core.info(`located - ${data.Location}`);
			resolve(data.Location);
		});
	});
}

function slash(path) {
	const isExtendedLengthPath = /^\\\\\?\\/.test(path);
	const hasNonAscii = /[^\u0000-\u0080]+/.test(path);

	if (isExtendedLengthPath || hasNonAscii) {
		return path;
	}

	return path.replace(/\\/g, '/');
}

function run() {
	try {
		const sourceDir = path.join(process.cwd(), SOURCE_DIR);
		const regex = /^.*\.(dmg|zip|exe|AppImage)$/
		const validPaths = paths.filter(p => new RegExp(regex).test(p.path));

		return Promise.all(
			validPaths.map(p => {
				const fileStream = fs.createReadStream(p.path);
				const bucketPath = path.join(destinationDir, path.relative(sourceDir, p.path));
				const params = {
					Bucket: BUCKET,
					Body: fileStream,
					ACL: 'public-read',
					Key: slash(bucketPath),
					ContentType: lookup(p.path) || 'text/plain'
				};
				return upload(params);
			})
		);
	} catch (error) {
		throw new Error(error)
	}
}

run()
	.then(locations => {
		core.info(`object key - ${destinationDir}`);
		core.info(`object locations - ${locations}`);
		core.setOutput('object_key', destinationDir);
		core.setOutput('object_locations', locations);
	})
	.catch(err => {
		core.error(err);
		core.setFailed(err.message);
	});
