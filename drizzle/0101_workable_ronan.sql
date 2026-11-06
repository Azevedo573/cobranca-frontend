CREATE TABLE `btgHttpDiagnosticos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chaveCaptura` varchar(36) NOT NULL,
	`ambiente` enum('sandbox','producao') NOT NULL,
	`btgIntegracaoId` int NOT NULL,
	`btgCobrancaEmitidaId` int NOT NULL,
	`btgRemessaId` int,
	`parcelaAcordoId` int NOT NULL,
	`condominioId` int NOT NULL,
	`usuarioId` int NOT NULL,
	`operacao` enum('emissao') NOT NULL DEFAULT 'emissao',
	`estadoCaptura` enum('preparado','enviando','resposta_recebida','resposta_incompleta','sem_resposta') NOT NULL DEFAULT 'preparado',
	`httpStatus` int,
	`correlationId` varchar(20) NOT NULL,
	`payloadCifrado` mediumtext,
	`respostaCifrada` mediumtext,
	`payloadSha256` varchar(64) NOT NULL,
	`respostaSha256` varchar(64),
	`payloadBytes` int NOT NULL,
	`respostaBytes` int,
	`respostaCompleta` int NOT NULL DEFAULT 0,
	`versaoCriptografia` varchar(20) NOT NULL DEFAULT 'v1',
	`capturaCriadaEm` timestamp NOT NULL DEFAULT (now()),
	`respostaRecebidaEm` timestamp,
	`conteudoExpurgadoEm` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `btgHttpDiagnosticos_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgHttpDiagnosticos_chave_unique` UNIQUE(`chaveCaptura`),
	CONSTRAINT `btgHttpDiagnosticos_emissao_unique` UNIQUE(`btgCobrancaEmitidaId`)
);
--> statement-breakpoint
CREATE INDEX `btgHttpDiagnosticos_remessa_idx` ON `btgHttpDiagnosticos` (`btgRemessaId`,`id`);--> statement-breakpoint
CREATE INDEX `btgHttpDiagnosticos_condominio_idx` ON `btgHttpDiagnosticos` (`condominioId`,`capturaCriadaEm`);