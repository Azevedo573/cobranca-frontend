CREATE TABLE `alertasInadimplenciaAcordo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`acordoId` int NOT NULL,
	`parcelaId` int NOT NULL,
	`condominioId` int NOT NULL,
	`devedorId` int NOT NULL,
	`nivel` int NOT NULL,
	`diasAtraso` int NOT NULL,
	`valorParcela` int NOT NULL,
	`dataVencimento` timestamp NOT NULL,
	`installmentNumber` int NOT NULL,
	`totalParcelas` int NOT NULL,
	`statusBoleto` varchar(50),
	`temBoletoAtualizado` int NOT NULL DEFAULT 0,
	`status` enum('pendente','em_tratativa','resolvido','ignorado') NOT NULL DEFAULT 'pendente',
	`resolvidoPor` int,
	`resolvidoEm` timestamp,
	`observacao` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alertasInadimplenciaAcordo_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `condominios` ADD `alertaParcela1Ativo` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `condominios` ADD `alertaParcela1Dias` int DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `condominios` ADD `alertaParcela2Ativo` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `condominios` ADD `alertaParcela2Dias` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `condominios` ADD `alertaParcela3Ativo` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `condominios` ADD `alertaParcela3Dias` int DEFAULT 30 NOT NULL;