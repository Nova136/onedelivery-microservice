const dotenv = require("dotenv");
const path = require("path");
import { DataSource, DataSourceOptions } from "typeorm";
import { runSeeders, SeederOptions } from "typeorm-extension";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import SopSeeder from "./src/database/seeds/sop.seed";
import FaqSeeder from "./src/database/seeds/faq.seed";
dotenv.config({ path: "../../.env" });

const { DB_TYPE, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } =
    process.env;

const options: DataSourceOptions & SeederOptions = {
    type: DB_TYPE as any,
    host: DB_HOST,
    port: Number(DB_PORT),
    username: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    entities: [(__dirname + "/**/*.entity{.ts,.js}").replace(/\\/g, "/")],
    seeds: [SopSeeder, FaqSeeder],
    namingStrategy: new SnakeNamingStrategy(),
};

const dataSource = new DataSource(options);

dataSource
    .initialize()
    .then(async () => {
        console.log("Data Source has been initialized!");
        await dataSource.query("CREATE EXTENSION IF NOT EXISTS vector;");
        await dataSource.query(`CREATE SCHEMA IF NOT EXISTS knowledge;`);
        await dataSource.synchronize(true);
        await runSeeders(dataSource);
        console.log("Seeding completed successfully.");
        process.exit();
    })
    .catch((error) => {
        console.error("Error during seeding:", error);
        process.exit(1);
    });
