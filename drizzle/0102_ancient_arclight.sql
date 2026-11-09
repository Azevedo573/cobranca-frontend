CREATE TABLE `btgRecuperacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chaveAnalise` varchar(36) NOT NULL,
	`btgIntegracaoId` int NOT NULL,
	`emissaoAnteriorId` int NOT NULL,
	`novaEmissaoId` int,
	`parcelaAcordoId` int NOT NULL,
	`btgRemessaId` int,
	`condominioId` int NOT NULL,
	`usuarioId` int NOT NULL,
	`diagnosticoId` int,
	`acao` enum('bloqueada','reenviar','recuperar_vinculo') NOT NULL,
	`codigo` varchar(80) NOT NULL,
	`estado` enum('analisada','consumida') NOT NULL DEFAULT 'analisada',
	`contextoHash` varchar(64) NOT NULL,
	`provaHash` varchar(64) NOT NULL,
	`consultaHash` varchar(64) NOT NULL,
	`consultaCompleta` int NOT NULL DEFAULT 0,
	`consultaCifrada` mediumtext NOT NULL,
	`criadaEm` timestamp NOT NULL,
	`expiraEm` timestamp NOT NULL,
	`consumidaEm` timestamp,
	CONSTRAINT `btgRecuperacoes_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgRecuperacoes_chave_unique` UNIQUE(`chaveAnalise`),
	CONSTRAINT `btgRecuperacoes_nova_emissao_unique` UNIQUE(`novaEmissaoId`)
);
--> statement-breakpoint
ALTER TABLE `btgCobrancasEmitidas` ADD `falhaAntesEnvioEm` timestamp;--> statement-breakpoint
CREATE INDEX `btgRecuperacoes_anterior_idx` ON `btgRecuperacoes` (`emissaoAnteriorId`,`estado`);--> statement-breakpoint
CREATE INDEX `btgRecuperacoes_parcela_idx` ON `btgRecuperacoes` (`parcelaAcordoId`,`id`);