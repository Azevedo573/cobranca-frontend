CREATE TABLE `anexosDemanda` (
	`id` int AUTO_INCREMENT NOT NULL,
	`demandaId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`fileKey` varchar(500),
	`tamanho` int,
	`mimeType` varchar(100),
	`uploadadoPorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `anexosDemanda_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assembleias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`condominioId` int,
	`tipoAssembleia` enum('ordinaria','extraordinaria','prestacao_contas','eleicao','outro') NOT NULL DEFAULT 'ordinaria',
	`data` timestamp NOT NULL,
	`hora` varchar(5) NOT NULL,
	`endereco` varchar(500),
	`advogadoResponsavelId` int,
	`advogadoNome` varchar(255),
	`statusAssembleia` enum('agendada','realizada','cancelada') NOT NULL DEFAULT 'agendada',
	`pauta` text,
	`ata` text,
	`horasGastas` decimal(5,2),
	`observacoes` text,
	`criadoPorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assembleias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `colunasDemanda` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`icone` varchar(10) NOT NULL DEFAULT '📋',
	`cor` varchar(30) NOT NULL DEFAULT 'slate',
	`ordem` int NOT NULL DEFAULT 0,
	`padrao` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `colunasDemanda_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `demandas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`numero` varchar(20) NOT NULL,
	`condominioId` int,
	`colunaId` int NOT NULL,
	`solicitante` varchar(255),
	`solicitanteTipo` varchar(50),
	`canalDemanda` enum('whatsapp','email','portal','telefone','presencial','assembleia','processo_interno','manual') NOT NULL DEFAULT 'manual',
	`assunto` varchar(255) NOT NULL,
	`descricao` text,
	`tipoDemanda` enum('parecer','convencao','assembleia','multa','notificacao','contratos','cobranca_judicial','processo','audiencia','execucao','acompanhamento','documentacao','relatorio','cadastro','outro') NOT NULL DEFAULT 'outro',
	`prioridadeDemanda` enum('baixa','media','alta','urgente') NOT NULL DEFAULT 'media',
	`prazo` timestamp,
	`responsavelId` int,
	`responsavelNome` varchar(255),
	`devedorId` int,
	`cobrancaId` int,
	`criadoPorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `demandas_id` PRIMARY KEY(`id`),
	CONSTRAINT `demandas_numero_unique` UNIQUE(`numero`)
);
--> statement-breakpoint
CREATE TABLE `timelineDemanda` (
	`id` int AUTO_INCREMENT NOT NULL,
	`demandaId` int NOT NULL,
	`tipoEventoDemanda` enum('criacao','atribuicao','movimentacao','comentario','anexo','email','whatsapp','conclusao','cancelamento','outro') NOT NULL DEFAULT 'outro',
	`descricao` text NOT NULL,
	`usuarioId` int,
	`usuarioNome` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `timelineDemanda_id` PRIMARY KEY(`id`)
);
