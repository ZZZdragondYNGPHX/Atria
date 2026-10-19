import '../../util/config.js';
import { seedNativeSessionFixture } from './_helpers.js';
try {
    const result = await seedNativeSessionFixture({ suffix: process.argv[2] });
    await new Promise((resolve, reject) => process.send(result, error => error ? reject(error) : resolve()));
    process.exit(0);
} catch (error) {
    console.error(error);
    process.exit(1);
}
