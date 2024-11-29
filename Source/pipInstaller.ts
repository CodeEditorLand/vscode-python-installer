// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from "path";
import { inject, injectable } from "inversify";

import { IInterpreterService } from "../../interpreter/contracts";
import { IServiceContainer } from "../../ioc/types";
import { ModuleInstallerType } from "../../pythonEnvironments/info";
import { sendTelemetryEvent } from "../../telemetry";
import { EventName } from "../../telemetry/constants";
import { IWorkspaceService } from "../application/types";
import { _SCRIPTS_DIR } from "../process/internal/scripts/constants";
import { IPythonExecutionFactory } from "../process/types";
import { ExecutionInfo, IInstaller, Product } from "../types";
import { isResource } from "../utils/misc";
import { ModuleInstaller, translateProductToModule } from "./moduleInstaller";
import { ProductNames } from "./productNames";
import { InterpreterUri, ModuleInstallFlags } from "./types";

@injectable()
export class PipInstaller extends ModuleInstaller {
	public get name(): string {
		return "Pip";
	}

	public get type(): ModuleInstallerType {
		return ModuleInstallerType.Pip;
	}

	public get displayName() {
		return "Pip";
	}

	public get priority(): number {
		return 0;
	}

	constructor(
		@inject(IServiceContainer) serviceContainer: IServiceContainer,
	) {
		super(serviceContainer);
	}

	public isSupported(resource?: InterpreterUri): Promise<boolean> {
		return this.isPipAvailable(resource);
	}

	protected async getExecutionInfo(
		moduleName: string,
		resource?: InterpreterUri,
		flags: ModuleInstallFlags = 0,
	): Promise<ExecutionInfo> {
		if (moduleName === translateProductToModule(Product.pip)) {
			const version = isResource(resource)
				? ""
				: `${resource.version?.major || ""}.${resource.version?.minor || ""}.${resource.version?.patch || ""}`;

			const envType = isResource(resource) ? undefined : resource.envType;

			sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, {
				installer: "unavailable",
				requiredInstaller: ModuleInstallerType.Pip,
				productName: ProductNames.get(Product.pip),
				version,
				envType,
			});

			// If `ensurepip` is available, if not, then install pip using the script file.
			const installer = this.serviceContainer.get<IInstaller>(IInstaller);

			if (await installer.isInstalled(Product.ensurepip, resource)) {
				return {
					args: [],
					moduleName: "ensurepip",
				};
			}

			sendTelemetryEvent(EventName.PYTHON_INSTALL_PACKAGE, undefined, {
				installer: "unavailable",
				requiredInstaller: ModuleInstallerType.Pip,
				productName: ProductNames.get(Product.ensurepip),
				version,
				envType,
			});

			// Return script to install pip.
			const interpreterService =
				this.serviceContainer.get<IInterpreterService>(
					IInterpreterService,
				);

			const interpreter = isResource(resource)
				? await interpreterService.getActiveInterpreter(resource)
				: resource;

			return {
				execPath: interpreter ? interpreter.path : "python",
				args: [path.join(_SCRIPTS_DIR, "get-pip.py")],
			};
		}

		const args: string[] = [];

		const workspaceService =
			this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);

		const proxy = workspaceService
			.getConfiguration("http")
			.get("proxy", "");

		if (proxy.length > 0) {
			args.push("--proxy");

			args.push(proxy);
		}

		args.push(...["install", "-U"]);

		if (flags & ModuleInstallFlags.reInstall) {
			args.push("--force-reinstall");
		}

		return {
			args: [...args, moduleName],
			moduleName: "pip",
		};
	}

	private isPipAvailable(info?: InterpreterUri): Promise<boolean> {
		const pythonExecutionFactory =
			this.serviceContainer.get<IPythonExecutionFactory>(
				IPythonExecutionFactory,
			);

		const resource = isResource(info) ? info : undefined;

		const pythonPath = isResource(info) ? undefined : info.path;

		return pythonExecutionFactory
			.create({ resource, pythonPath })
			.then((proc) => proc.isModuleInstalled("pip"))
			.catch(() => false);
	}
}
