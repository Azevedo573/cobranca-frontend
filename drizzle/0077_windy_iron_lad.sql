CREATE TABLE `whatsappFilaEnvio` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instanciaId` int NOT NULL,
	`telefone` varchar(30) NOT NULL,
	`mensagem` text NOT NULL,
	`reguaId` int,
	`posicaoId` int,
	`cobrancaId` int,
	`devedorId` int,
	`condominioId` int,
	`status` enum('aguardando','enviando','enviado','erro','cancelado') NOT NULL DEFAULT 'aguardando',
	`tentativas` int NOT NULL DEFAULT 0,
	`proximaTentativa` timestamp,
	`enviadoEm` timestamp,
	`erro` text,
	`messageId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappFilaEnvio_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `condominios` ADD `tipo` enum('condominio','empresa') DEFAULT 'condominio' NOT NULL;--> statement-breakpoint
ALTER TABLE `condominios` ADD `statusCadastro` varchar(20) DEFAULT 'ativo' NOT NULL;--> statement-breakpoint
ALTER TABLE `condominios` ADD `dataRescisao` varchar(10);--> statement-breakpoint
ALTER TABLE `condominios` ADD `motivoSaida` text;--> statement-breakpoint
ALTER TABLE `condominios` ADD `situacaoJuridica` varchar(30);--> statement-breakpoint
ALTER TABLE `condominios` ADD `observacoesSaida` text;--> statement-breakpoint
ALTER TABLE `reguaPosicoes` ADD `loopAtivo` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reguaPosicoes` ADD `loopAlvoPosicaoId` int;--> statement-breakpoint
ALTER TABLE `reguaPosicoes` ADD `loopIntervaloDias` int DEFAULT 7;--> statement-breakpoint
ALTER TABLE `reguaPosicoes` ADD `loopMaxRepeticoes` int DEFAULT 3;--> statement-breakpoint
ALTER TABLE `reguasCobranca` ADD `abrangenciaCondominio` enum('todos','selecionados') DEFAULT 'todos' NOT NULL;--> statement-breakpoint
ALTER TABLE `reguasCobranca` ADD `condominiosSelecionados` text;--> statement-breakpoint
ALTER TABLE `reguasCobranca` ADD `abrangenciaCategoria` enum('todos','padrao','ajuizada') DEFAULT 'todos' NOT NULL;--> statement-breakpoint
ALTER TABLE `reguasCobranca` ADD `finalidades` text;--> statement-breakpoint
ALTER TABLE `reguasCobranca` ADD `criterios` text;--> statement-breakpoint
ALTER TABLE `reguasCobranca` ADD `regrasBloqueio` text;--> statement-breakpoint
ALTER TABLE `reguasCobranca` ADD `prioridade` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reguasCobranca` ADD `intervaloMinimoContatos` int DEFAULT 0 NOT NULL;