import Pushy from "pushy-electron";
import { readSessionData } from "./auth";
import { post } from "./v1-client";
import * as log from "electron-log";
import { BrowserWindow } from "electron";
import { nameToSlug } from "./package";
import {
	getInstalledPackages,
	getPackagesInstalledList,
	updatePackageInstalledList
} from "./tea-dir";
import { app } from "electron";

export default function initialize(mainWindow: BrowserWindow) {
	Pushy.listen();
	// Register device for push notifications
	Pushy.register({ appId: "643647948f3b62fb34b29989" })
		.then(async (push_token) => {
			const { device_id } = await readSessionData();
			if (device_id) await post(`/auth/device/${device_id}/register-push-token`, { push_token });
		})
		.catch((err) => {
			log.error(err);
			// Display error dialog
			// Pushy.alert(mainWindow, 'Pushy registration error: ' + err.message);
		});

	// Listen for incoming notifications
	Pushy.setNotificationListener((data: any) => {
		// Display an alert with the "message" payload value
		log.info("push data:", data);
		// TODO: replace this with something
		Pushy.alert(mainWindow, data?.message as string);
		const v = app.dock.getBadge();
		if (!v) {
			app.dock.setBadge("1");
		}
	});
}

export async function subscribeToPackageTopic(pkgFullname: string) {
	try {
		if (Pushy.isRegistered()) {
			const slug = nameToSlug(pkgFullname);

			// override rules for brewkit_mnt
			if (slug.includes("brewkit_mnt")) return;

			const platformArch = getTopicArch();
			const topic = `packages-${slug}_${platformArch}`;

			await Pushy.subscribe(topic);
			log.info("push: registered to pkg-topic: ", topic);
		} else {
			log.info("pushy is not registered");
		}
	} catch (error) {
		log.error(error);
	}
}

export async function unsubscribeToPackageTopic(pkgFullname: string) {
	try {
		if (Pushy.isRegistered()) {
			const slug = nameToSlug(pkgFullname);
			const topic = `packages-${slug}`;
			await Pushy.unsubscribe(topic);
			log.info("push: unregistered from pkg-topic: ", topic);
		} else {
			log.info("pushy is not registered");
		}
	} catch (error) {
		log.error(error);
	}
}

export async function syncPackageTopicSubscriptions() {
	try {
		log.info("syncing package topic subscriptions");
		const [installedPackages, lastInstalledList] = await Promise.all([
			getInstalledPackages(),
			getPackagesInstalledList()
		]);

		const previouslyInstalledNames = lastInstalledList.map((pkg) => pkg.full_name);
		const currentlyInstalledNames = installedPackages.map((pkg) => pkg.full_name);

		const subscribedTo = currentlyInstalledNames.filter(
			(pkg) => !previouslyInstalledNames.includes(pkg)
		);
		const unsubscribedFrom = previouslyInstalledNames.filter(
			(pkg) => !currentlyInstalledNames.includes(pkg)
		);

		for (const subscribe of subscribedTo) {
			await subscribeToPackageTopic(subscribe);
		}
		for (const unsubscribe of unsubscribedFrom) {
			await unsubscribeToPackageTopic(unsubscribe);
		}

		await updatePackageInstalledList(installedPackages);
	} catch (error) {
		log.error(error);
	}
}

enum PlatformArch {
	DarwinAarch64 = "darwin_aarch64",
	DarwinX86_64 = "darwin_x86-64",
	LinuxAarch64 = "linux_aarch64",
	LinuxX86_64 = "linux_x86-64"
}

export function getTopicArch() {
	const arch = (process.arch as string) === "arm64" ? "aarch64" : "x86-64";
	const platform = process.platform === "darwin" ? "darwin" : "linux";
	return `${platform}_${arch}` as PlatformArch;
}